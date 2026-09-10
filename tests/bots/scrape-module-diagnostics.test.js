'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const modulePath='../../src/extractors/runModule';
const run = (...args) => require(modulePath)(...args);
const spec={panelSelector:'#panel',ready:{selector:'#details'}};
const base={key:'loans',spec,requestedFields:['Loan History']};
test('a missing panel or readiness timeout never runs the extractor',async()=>{
 let calls=0;
 const page={url:()=> 'https://employer.forusall.com/participants/fixture',waitForSelector:async()=>{throw new Error('Timeout');}};
 const result=await run(page,{...base,extractor:async()=>{calls++;return {data:{}};}});
 assert.equal(calls,0);assert.equal(result.status,'error');assert.equal(result.diagnostics.dataState,'panel_missing');
 const notReady={...page,waitForSelector:async sel=>{if(sel==='#details')throw new Error('Timeout');}};
 const r=await run(notReady,{...base,extractor:async()=>{calls++;}});
 assert.equal(calls,0);assert.equal(r.diagnostics.dataState,'unavailable');
});
test('extractor failure stays error and public formatter preserves diagnostics',async()=>{
 const page={url:()=> 'https://employer.forusall.com/participants/fixture',waitForSelector:async()=>{}};
 const result=await run(page,{...base,extractor:async()=>{throw new Error('parse failed with private text');}});
 assert.equal(result.status,'error');assert.equal(result.diagnostics.dataState,'parse_error');
 for(const path of ['scrape-participant','scrape-plan']){
  const pub=require(`../../src/bots/forusall-${path}/formatPublic`)({data:{modules:[result]}});
  assert.equal(pub.extractionDiagnostics.modules.loans.dataState,'parse_error');
  assert.equal(JSON.stringify(pub).includes('private text'),false);
 }
});
test('explicit values zero, false and empty array survive extraction and formatting',async()=>{
 const page={url:()=> 'https://employer.forusall.com/participants/fixture',waitForSelector:async()=>{}};
 const data={balance:0,active:false,loans:[]};
 const result=await run(page,{...base,requestedFields:null,extractor:async()=>({data})});
 assert.equal(result.status,'ok');assert.deepEqual(result.data,data);
 assert.equal(result.diagnostics.completeness.complete,true);
});
test('login redirects and access-denied failures stay unavailable with no scrape',async()=>{
 const page={url:()=> 'https://employer.forusall.com/users/sign_in',waitForSelector:async()=>{}};
 const result=await run(page,{...base,extractor:async()=>{throw new Error('should not run');}});
 assert.equal(result.diagnostics.dataState,'access_denied');
});

test('snapshot-only modules stay readable while data extraction remains unavailable', async()=>{
 const page={url:()=> 'https://employer.forusall.com/participants/fixture',waitForSelector:async()=>{}};
 const result=await run(page,{...base,extractor:null,allowSnapshotOnly:true});
 assert.equal(result.status,'partial');
 assert.equal(result.diagnostics.dataState,'unavailable');
 assert.equal(result.diagnostics.completeness.complete,false);
 assert.equal(result.data,undefined);
});
