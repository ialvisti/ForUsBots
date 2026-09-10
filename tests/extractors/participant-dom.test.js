'use strict';
// Synthetic current_structure fixtures: observed portal selectors/format, no participant data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const loans = require('../../src/extractors/forusall-participant/modules/loans');
const payroll = require('../../src/extractors/forusall-participant/modules/payroll');
const savings = require('../../src/extractors/forusall-participant/modules/savings_rate');
const browserPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath();
const options = { skip: !fs.existsSync(browserPath) && process.env.FORUSBOTS_REQUIRE_DOM_TESTS !== '1' && 'Set PLAYWRIGHT_CHROMIUM_EXECUTABLE or install playwright chromium for DOM contracts' };
async function extract(fn, html, opts) {
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    return await fn(page, opts);
  } finally { await browser.close(); }
}
const row = (label, value) => `<div class="row field form-group"><div class="col-md-4"><label>${label}</label></div><div class="col-md-8 left-align">${value}</div></div>`;
const loanShell = content => `<div id="loan"><div id="loan-details"><div class="row field form-group form-bound">${row('Maximum Number of Loans', '2')}</div><div class="row field form-group form-bound">${content}</div></div></div>`;
const loanHeaders = ['Start Date', 'End Date', 'Repayment Amount', 'Principal', 'Outstanding Balance', 'Balance as of Date'];
const sixCols = values => `<div class="row field form-group">${values.map(v => `<div class="col-md-2">${v}</div>`).join('')}</div>`;
test('loan history distinguishes explicit empty from unparsed content and missing panel', options, async () => {
  const empty = await extract(loans, loanShell('<div class="col-md-12">No loan history found</div>'), { scope:'#loan', fields:['Loan History'] });
  assert.equal(empty.data['Loan History'], "There's no Loan History for this Participant");
  assert.equal(empty.diagnostics.fields['Loan History'].dataState, 'empty');
  const malformed = await extract(loans, loanShell('<div>Loading loan history...</div>'), { scope:'#loan', fields:['Loan History'] });
  assert.equal(malformed.data['Loan History'], null);
  assert.equal(malformed.diagnostics.fields['Loan History'].dataState, 'parse_error');
  const missing = await extract(loans, '<div id="loan"></div>', { scope:'#loan', fields:['Loan History'] });
  assert.equal(missing.data['Loan History'], null);
  assert.equal(missing.diagnostics.fields['Loan History'].dataState, 'panel_missing');
});
test('loans read actual six-column divs and preserve zero and absent values', options, async () => {
  const html = loanShell(sixCols(loanHeaders.map(h=>`<label>${h}</label>`)) + sixCols(['2025-01-15', '', '$50.00', '$1,000.00', '$0.00', '2026-09-07']));
  const result=await extract(loans,html,{scope:'#loan',fields:['Loan History']});
  assert.equal(result.data['Loan History'][0]['Outstanding Balance'],0);
  assert.equal(result.data['Loan History'][0]['End Date'],'');
  assert.equal(result.diagnostics.fields['Loan History'].dataState,'ok');
});
const payRow = (date,amount='$10.00') => `<div class="row field form-group">${[date,amount,'$0.00','$2.00','$0.00','$100.00','8'].map(v=>`<div class="col-md-1">${v}</div>`).join('')}</div>`;
const payGroup = (year,rows) => `<div id="${year}-payroll-values" class="payroll-year-group">${rows}</div>`;
const payShell = groups => `<div id="payroll"><div id="payroll-details"><select id="payroll_year"><option value="all">All</option><option value="2024">2024</option><option value="2026">2026</option></select>${groups}</div></div>`;
test('latest payroll uses maximum valid date independent of DOM order and reports scope', options, async () => {
 const result=await extract(payroll,payShell(payGroup('2024',payRow('2024-12-31'))+payGroup('2026',payRow('2026-01-01')+payRow('2026-09-01'))),{scope:'#payroll',fields:['Latest Payroll']});
 assert.equal(result.data['Latest Payroll']['Pay Date'],'2026-09-01');
 assert.equal(result.diagnostics.completeness.complete,true);
 assert.deepEqual(result.diagnostics.completeness.scope.years,['2026','2024']);
});
test('payroll reports unloaded years and does not convert malformed amount into zero', options, async () => {
 const result=await extract(payroll,payShell(payGroup('2024',payRow('2024-12-31','pending'))),{scope:'#payroll',fields:['Latest Payroll']});
 assert.equal(result.data['Latest Payroll']['Pre-tax'],null);
 assert.equal(result.diagnostics.completeness.complete,false);
 assert.equal(result.diagnostics.fields['Latest Payroll'].dataState,'unavailable');
});
test('savings separates balance dates and vested amounts without concatenating numbers', options, async () => {
 const html=`<div id="savings-rate"><div id="savings-rate-details">${row('Account Balance','$1,234.56 as of 2026-09-07')}${row('Employer Match Balance','$400.00 ($0.00 vested)')}${row('Roth Deferral Balance','$0.00')}</div></div>`;
 const result=await extract(savings,html,{scope:'#savings-rate'});
 assert.equal(result.data['Account Balance'],1234.56);
 assert.equal(result.data['Account Balance As Of'],'2026-09-07');
 assert.equal(result.data['Employer Match Balance'],400);
 assert.equal(result.data['Employer Match Vested Balance'],0);
 assert.equal(result.diagnostics.fields['Account Balance'].sourceAsOf,'2026-09-07');
 assert.equal(result.diagnostics.fields['Employer Match Balance'].sourceAsOf,null);
});

test('malformed loan rows and pagination never imply complete loan history', options, async () => {
 const malformed=sixCols(loanHeaders.map(h=>`<label>${h}</label>`))+'<div class="row field form-group"><div class="col-md-2">2026-01-01</div><div class="col-md-2">pending</div></div>';
 const result=await extract(loans,loanShell(malformed),{scope:'#loan',fields:['Loan History']});
 assert.equal(result.data['Loan History'],null);
 assert.equal(result.diagnostics.completeness.complete,false);
 const paged=await extract(loans,loanShell(sixCols(loanHeaders.map(h=>`<label>${h}</label>`))+sixCols(['2025-01-15','','$50.00','$1,000.00','$0.00','2026-09-07'])+'<li class="paginate_button next"><a>Next</a></li>'),{scope:'#loan',fields:['Loan History']});
 assert.equal(paged.diagnostics.completeness.complete,false);
 assert.equal(paged.diagnostics.completeness.truncated,true);
});
test('dynamic panel readiness waits before extracting and reports the final values',options,async()=>{
 const run=require('../../src/extractors/runModule');
 const browser=await chromium.launch({executablePath:browserPath,headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent('<div id="loan"></div><script>setTimeout(()=>{document.querySelector("#loan").innerHTML=`<div id="loan-details"><div class="row field form-group form-bound"></div><div class="row field form-group form-bound"><div class="col-md-12">No loan history found</div></div></div>`},100)</script>');
  const result=await run(page,{key:'loans',spec:{panelSelector:'#loan',ready:{selector:'#loan-details'}},extractor:loans,requestedFields:['Loan History']});
  assert.equal(result.status,'ok');
  assert.equal(result.diagnostics.fields['Loan History'].dataState,'empty');
 }finally{await browser.close();}
});
test('savings supports parenthesized as-of and never labels total as vested',options,async()=>{
 const result=await extract(savings,`<div id="savings-rate-details">${row('Account Balance','$2,000.00 (as of 2026-09-07)')}${row('Employer Match Balance','$500.00')}</div>`,{fields:['Account Balance','Employer Match Vested Balance']});
 assert.equal(result.data['Account Balance'],2000);
 assert.equal(result.data['Employer Match Vested Balance'],null);
 assert.equal(result.diagnostics.fields['Employer Match Vested Balance'].dataState,'missing');
});

test('mixed loan rows never hide a second loan with an incomplete structure',options,async()=>{
 const header=sixCols(loanHeaders.map(h=>`<label>${h}</label>`));
 const valid=sixCols(['2025-01-15','','$50.00','$1,000.00','$0.00','2026-09-07']);
 const broken='<div class="row field form-group"><div class="col-md-2">2026-08-01</div><div class="col-md-2">Unknown</div></div>';
 const result=await extract(loans,loanShell(header+valid+broken),{fields:['Loan History']});
 assert.equal(result.data['Loan History'].length,1);
 assert.equal(result.diagnostics.completeness.observedCount,2);
 assert.equal(result.diagnostics.completeness.complete,false);
 assert.equal(result.diagnostics.fields['Loan History'].dataState,'parse_error');
});
test('an unparseable loan amount cannot certify an empty outstanding balance',options,async()=>{
 const content=sixCols(loanHeaders.map(h=>`<label>${h}</label>`))+sixCols(['2025-01-15','','$50.00','$1,000.00','pending','2026-09-07']);
 const result=await extract(loans,loanShell(content),{fields:['Loan History']});
 assert.equal(result.data['Loan History'][0]['Outstanding Balance'],null);
 assert.equal(result.diagnostics.completeness.complete,false);
});

test('a request for loan limit does not require unrelated loan history',options,async()=>{
 const result=await extract(loans,`<div id="loan-details">${row('Maximum Number of Loans','2')}</div>`,{fields:['Maximum Number of Loans']});
 assert.equal(result.data['Maximum Number of Loans'],'2');
 assert.equal(result.diagnostics.dataState,'ok');
 assert.equal(result.diagnostics.completeness.complete,true);
});

test('latest payroll diagnostics count returned rows and ignore labelled headers',options,async()=>{
 const header=payRow('Pay Date').replace('Pay Date','<label>Pay Date</label>');
 const html=payShell(payGroup('2024',payRow('2024-12-31'))+payGroup('2026',header+payRow('2026-01-01')+payRow('2026-09-01')));
 const result=await extract(payroll,html,{fields:['Latest Payroll']});
 assert.equal(result.diagnostics.completeness.complete,true);
 assert.equal(result.diagnostics.completeness.observedCount,3);
 assert.equal(result.diagnostics.completeness.returnedCount,1);
});
