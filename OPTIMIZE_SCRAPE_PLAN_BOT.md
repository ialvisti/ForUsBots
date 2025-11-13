# Performance Optimization Task: `forusall-scrape-plan` Bot

## 🎯 Objective

Optimize the `forusall-scrape-plan` bot to reduce execution time from **~20 seconds** to **~1-3 seconds** (similar to `forusall-scrape-participant`), while maintaining 100% functionality and data accuracy.

---

## 📊 Current Performance Analysis

### Baseline Metrics (Plan ID: 627, All Modules)
```
Total Execution Time: ~19-20 seconds

Breakdown by Stage:
- goto-plan:           2.95s
- login + otp:         5.46s (1.23s login + 4.23s OTP)
- module:basic_info:   0.75s (244ms locate + 508ms extract)
- module:plan_design:  0.72s (212ms locate + 509ms extract)
- module:onboarding:   1.59s (6ms locate + 1079ms nav + 505ms extract)
- module:communications: 1.57s (4ms locate + 1059ms nav + 508ms extract)
- module:extra_settings: 1.56s (3ms locate + 1048ms nav + 509ms extract)
- module:feature_flags:  1.58s (8ms locate + 1061ms nav + 508ms extract)
- extract-notes:       0.01s
- done:                0s
```

### 🔴 Primary Bottleneck Identified

**Tab Navigation Overhead: ~1.05s per tab × 4 tabs = 4.2 seconds**

Each tab module (onboarding, communications, extra_settings, feature_flags) spends:
- ~1000-1100ms on navigation (`navigate-tab` action)
- ~500ms on extraction

This accounts for **~6.3 seconds** of the total 19 seconds (33% of total time).

---

## 📁 Files to Analyze and Optimize

### Primary Target Files (MUST READ AND UNDERSTAND)
```
/Users/ivanalvis/Desktop/ForUsBots copy/src/bots/forusall-scrape-plan/
├── runFlow.js              ← MAIN TARGET: Contains navigation & extraction logic
├── controller.js           ← Review for any controller-level optimizations
└── routes.js               ← Likely no changes needed

/Users/ivanalvis/Desktop/ForUsBots copy/src/extractors/forusall-plan/
├── registry.js             ← Module registry and field validation
├── utils.js                ← Extraction utilities (tidy, extractPairs, etc.)
└── modules/
    ├── basic_info.js       ← Extractor for top-level panel
    ├── plan_design.js      ← Extractor for Plan Design tab
    ├── onboarding.js       ← Extractor for Onboarding tab
    ├── communications.js   ← Extractor for Communications tab
    ├── extra_settings.js   ← Extractor for Extra Settings tab
    └── feature_flags.js    ← Extractor for Feature Flags tab

/Users/ivanalvis/Desktop/ForUsBots copy/src/providers/forusall/planMap.js
└── Module definitions with selectors and navigation metadata
```

### Reference Files (READ FOR COMPARISON & BEST PRACTICES)
```
/Users/ivanalvis/Desktop/ForUsBots copy/src/bots/forusall-scrape-participant/
├── runFlow.js              ← STUDY THIS: ~1s execution time, similar pattern
├── controller.js
└── routes.js

/Users/ivanalvis/Desktop/ForUsBots copy/src/extractors/forusall-participant/
├── registry.js
├── utils.js
└── modules/
    └── (all participant extractors)
```

---

## 🔍 Investigation Steps

### Step 1: Understand Current Implementation
1. **Read** `src/bots/forusall-scrape-plan/runFlow.js` completely
2. **Identify** all `page.waitForTimeout()` calls and their durations
3. **Identify** all `waitForSelector()` calls and their timeout values
4. **Map** the exact flow for tab navigation:
   - How are tabs clicked?
   - What waits occur before/after clicks?
   - What confirms a tab is "ready"?

### Step 2: Compare with High-Performance Reference
1. **Read** `src/bots/forusall-scrape-participant/runFlow.js` completely
2. **Compare** navigation patterns between the two bots:
   - How does the participant bot handle module navigation?
   - What wait strategies does it use?
   - Are there any shared context or caching mechanisms?
3. **Identify** key differences in implementation

### Step 3: Analyze Bottlenecks
1. **Tab Navigation (~1s each)**:
   - Is `page.waitForTimeout(500)` necessary after each tab click?
   - Can we reduce timeout values for `waitForSelector(spec.ready.selector, { timeout: 3000 })`?
   - Can we eliminate the `page.waitForTimeout(200)` after ready selector?
   - Can we use faster wait strategies (e.g., `domcontentloaded` events)?

2. **Extraction Time (~500ms per module)**:
   - Are `page.evaluate()` calls optimized?
   - Can we batch-extract data from multiple tabs in a single evaluate?
   - Are there unnecessary DOM queries in extractors?

3. **Initial Navigation (~3s)**:
   - Can we skip the initial `gotoFast` if already on the plan page?
   - Can we reduce post-login wait times?

---

## 💡 Optimization Strategies to Consider

### Strategy 1: Reduce/Eliminate Artificial Waits
**Current Code Pattern in `runFlow.js`:**
```javascript
await page.click(spec.navSelector);
await page.waitForTimeout(500);  // ← ARTIFICIAL WAIT
await page.waitForSelector(spec.ready.selector, { timeout: 3000 });
await page.waitForTimeout(200);  // ← ARTIFICIAL WAIT
```

**Potential Optimization:**
- Rely solely on `waitForSelector` with optimized timeout
- Remove `waitForTimeout` calls if the selector is reliable
- Reduce `waitForSelector` timeout from 3000ms to 1500ms or 1000ms
- Test if `{ state: 'visible' }` or `{ state: 'attached' }` can replace waits

### Strategy 2: Batch Extraction (Advanced)
Instead of:
1. Click tab → wait → extract
2. Click tab → wait → extract
3. Click tab → wait → extract

Consider:
1. Extract ALL tab data in a single `page.evaluate()` by:
   - Simulating tab clicks via JavaScript (faster than Playwright clicks)
   - Reading all tab content in one DOM traversal
   - Returning all data at once

**Example Pseudo-code:**
```javascript
const allTabData = await page.evaluate(() => {
  const tabs = ['#plan-design', '#onboarding', '#communications', ...];
  const results = {};
  
  for (const tabId of tabs) {
    // Activate tab programmatically
    const tabLink = document.querySelector(`a[href="${tabId}"]`);
    if (tabLink) tabLink.click();
    
    // Extract data immediately (tabs are pre-loaded in DOM)
    const panel = document.querySelector(tabId);
    results[tabId] = extractDataFromPanel(panel);
  }
  
  return results;
});
```

### Strategy 3: Optimize Selector Waits
- Use more specific selectors that appear faster
- Use `page.waitForFunction()` instead of `waitForSelector` if checking dynamic content
- Reduce timeout values aggressively (test with 500ms, 1000ms)

### Strategy 4: Parallel Extraction (If Possible)
- If tabs are already in the DOM (just hidden), extract data from all tabs in parallel
- Use `Promise.all()` for independent operations

### Strategy 5: Skip Unnecessary Steps
- If `basic_info` and `plan_design` are already visible, skip navigation entirely
- Cache form state if multiple scrapes happen in succession

---

## ✅ Success Criteria

### 1. Performance Target
- **Total execution time**: ≤ 3 seconds (when session is cached, no login/OTP)
- **Total execution time**: ≤ 10 seconds (with login + OTP)
- **Per-module extraction**: ≤ 300ms average

### 2. Data Accuracy (CRITICAL)
Extract the following data for **Plan ID 627** and verify against baseline:

#### Baseline Data (Current Working Version)
```json
{
  "basic_info": {
    "plan_id": "627",
    "version_id": "2021-01-01",
    "symlink": "revolutionfoods",
    "sfdc_id": "",
    "company_name": "Revolution Foods, Inc.",
    "official_plan_name": "Revolution Foods, Inc. 401(k) Plan",
    "rm_id": "sponsorservices@forusall.com",
    "im_id": "melissa@forusall.com",
    "service_type": "Full",
    "plan_type": "Conversion",
    "active": "False",
    "status": "Terminated",
    "status_as_of": "2023-07-24",
    "is_3_16_only": "",
    "ein": "141955846",
    "effective_date": ""
  },
  "plan_design": {
    "record_keeper_id": "Vanguard",
    "rk_plan_id": "261209",
    "external_name": "",
    "lt_plan_type": "",
    "accept_covid19_amendment": "false",
    "fund_lineup_id": "Generic Lineup",
    "enrollment_type": "opt in for all",
    "eligibility_min_age": 18,
    "eligibility_duration_value": 1,
    "eligibility_duration_unit": "Months",
    "eligibility_hours_requirement": 0,
    "plan_entry_frequency": "Monthly",
    "plan_entry_frequency_first_month": "",
    "plan_entry_frequency_second_month": "",
    "employer_contribution": "No Employer Contribution",
    "er_contribution_monthly_cap": "",
    "employer_contribution_cap": 0,
    "employer_contribution_timing": "",
    "employer_contribution_options_qaca": "false",
    "default_savings_rate": 6,
    "contribution_type": "both dollar & percent",
    "autoescalate_rate": 0,
    "support_aftertax": "false",
    "alts_crypto": "false",
    "alts_waitlist_crypto": "false",
    "max_crypto_percent_balance": 0
  },
  "onboarding": {
    "first_deferral_date": "2021-01-15",
    "special_participation_date": "",
    "enrollment_method": "Current rates",
    "blackout_begins_date": "2021-01-25",
    "blackout_ends_date": "2021-02-26",
    "website_live_date": "2021-01-01"
  },
  "communications": {
    "dave_text": "The Revolution Foods<br>401(k) Plan",
    "logo": "revolutionfoods",
    "spanish_participants": "Yes",
    "e_statement": "Yes",
    "raffle_prize": "",
    "raffle_date": ""
  },
  "extra_settings": {
    "rk_upload_mode": "Legacy",
    "plan_year_start": "January",
    "er_contribution_eligibility": "Same as EE deferrals",
    "er_match_eligibility_age": "",
    "er_match_eligibility_duration_value": 0,
    "er_match_eligibility_duration_unit": "Months",
    "er_match_eligibility_hours_requirement": "",
    "er_match_plan_entry_frequency": "Immediate",
    "er_match_plan_entry_frequency_first_month": "",
    "er_match_plan_entry_frequency_second_month": ""
  },
  "feature_flags": {
    "payroll_xray": "true",
    "payroll_issue": "true",
    "simple_upload": "false"
  },
  "notes": [
    "Updating status and termination date based on the timeline provided by American Trust - Liquidation: 7/24/2023. ZD Ticket https://forus.zendesk.com/agent/tickets/355334",
    "plan moved to principal",
    "Updated to calendar year",
    "Updating to SponsorServices",
    "reverting effective date",
    "moving effective date to test notice packet link",
    "ongoing",
    "1/15 first deferral. Opening enrollment window 1/1 due to only partial census loaded at VG at the moment",
    "moving to VG"
  ]
}
```

**ALL fields must match exactly after optimization.**

### 3. Functionality Requirements
- ✅ All 6 modules extract correctly
- ✅ Notes array contains all 9 notes
- ✅ Field filtering works (specific fields can be requested)
- ✅ Module filtering works (subset of modules can be requested)
- ✅ No breaking changes to other bots
- ✅ No linter errors introduced

---

## 🧪 Testing Protocol

### Test 1: Full Extraction (All Modules)
```bash
jobId=$(curl -X POST http://localhost:10000/forusbot/scrape-plan \
  -H "Authorization: Bearer 1" \
  -H "Content-Type: application/json" \
  -d '{"planId": "627", "modules": ["basic_info", "plan_design", "onboarding", "communications", "extra_settings", "feature_flags"]}' \
  -s | jq -r '.jobId') && \
echo "Job ID: $jobId" && \
sleep 5 && \
curl -s "http://localhost:10000/forusbot/jobs/$jobId" -H "Authorization: Bearer 1" | jq '{
  state,
  totalSeconds,
  stagesSummaryMsByName,
  modules: .result.data.modules | map({key, status, fieldCount: (.data | length)}),
  notesCount: (.result.data.notes | length)
}'
```

**Expected Result:**
- `state`: `"succeeded"`
- `totalSeconds`: ≤ 3 (with cached session)
- All 6 modules: `status: "ok"`
- `notesCount`: 9

### Test 2: Selective Modules
```bash
# Test each module individually
for module in "basic_info" "plan_design" "onboarding" "communications" "extra_settings" "feature_flags"; do
  echo "Testing module: $module"
  jobId=$(curl -X POST http://localhost:10000/forusbot/scrape-plan \
    -H "Authorization: Bearer 1" \
    -H "Content-Type: application/json" \
    -d "{\"planId\": \"627\", \"modules\": [\"$module\"]}" \
    -s | jq -r '.jobId')
  sleep 3
  curl -s "http://localhost:10000/forusbot/jobs/$jobId" -H "Authorization: Bearer 1" | jq '{state, totalSeconds, module: .result.data.modules[0].key, status: .result.data.modules[0].status}'
done
```

**Expected Result:**
- Each module extracts successfully in ≤ 2 seconds

### Test 3: Field Filtering
```bash
jobId=$(curl -X POST http://localhost:10000/forusbot/scrape-plan \
  -H "Authorization: Bearer 1" \
  -H "Content-Type: application/json" \
  -d '{"planId": "627", "modules": [{"key": "basic_info", "fields": ["plan_id", "company_name", "ein"]}]}' \
  -s | jq -r '.jobId') && \
sleep 3 && \
curl -s "http://localhost:10000/forusbot/jobs/$jobId" -H "Authorization: Bearer 1" | jq '.result.data.modules[0].data'
```

**Expected Result:**
```json
{
  "plan_id": "627",
  "company_name": "Revolution Foods, Inc.",
  "ein": "141955846"
}
```

### Test 4: Data Accuracy Verification
```bash
# Extract all data and save to file
jobId=$(curl -X POST http://localhost:10000/forusbot/scrape-plan \
  -H "Authorization: Bearer 1" \
  -H "Content-Type: application/json" \
  -d '{"planId": "627", "modules": ["basic_info", "plan_design", "onboarding", "communications", "extra_settings", "feature_flags"]}' \
  -s | jq -r '.jobId') && \
sleep 5 && \
curl -s "http://localhost:10000/forusbot/jobs/$jobId" -H "Authorization: Bearer 1" | jq '.result.data' > /tmp/optimized_plan_627.json

# Compare with baseline (manual verification)
echo "Review /tmp/optimized_plan_627.json and verify all fields match baseline"
```

### Test 5: No Regression on Other Bots
```bash
# Quick smoke test on participant scraper
jobId=$(curl -X POST http://localhost:10000/forusbot/scrape-participant \
  -H "Authorization: Bearer 1" \
  -H "Content-Type: application/json" \
  -d '{"participantId": "1", "modules": ["census"]}' \
  -s | jq -r '.jobId') && \
sleep 3 && \
curl -s "http://localhost:10000/forusbot/jobs/$jobId" -H "Authorization: Bearer 1" | jq '{state, botId}'
```

**Expected Result:**
- `state`: `"succeeded"`
- `botId`: `"scrape-participant"`

---

## 🚨 Critical Constraints

### DO NOT:
1. ❌ Modify any files outside the specified scope:
   - `/src/bots/forusall-scrape-plan/`
   - `/src/extractors/forusall-plan/`
   - `/src/providers/forusall/planMap.js`

2. ❌ Change the API contract:
   - Request/response format must remain identical
   - Module keys must not change
   - Field names must not change

3. ❌ Remove any functionality:
   - Field filtering must still work
   - Module filtering must still work
   - All 6 modules must remain supported

4. ❌ Introduce dependencies:
   - Use only existing project utilities
   - No new npm packages

5. ❌ Break other bots:
   - Do not modify shared engine files (`/src/engine/`)
   - Do not modify participant scraper files
   - Do not modify shared provider config (`/src/providers/forusall/config.js`)

### DO:
1. ✅ Use project best practices from `always_applied_workspace_rules`
2. ✅ Follow coding patterns from `forusall-scrape-participant`
3. ✅ Add comments explaining optimizations
4. ✅ Run linter and fix any errors: `npm run lint`
5. ✅ Test exhaustively with Plan ID 627
6. ✅ Document performance improvements in code comments

---

## 📝 Deliverables

### 1. Optimized Code
- Modified files with clear comments explaining optimizations
- No linter errors

### 2. Performance Report
Provide a markdown table comparing before/after:

```markdown
| Metric                  | Before | After | Improvement |
|-------------------------|--------|-------|-------------|
| Total Time (cached)     | 19s    | ?s    | ?%          |
| Total Time (login+OTP)  | 19s    | ?s    | ?%          |
| Tab Navigation (avg)    | 1.05s  | ?s    | ?%          |
| Module Extraction (avg) | 0.51s  | ?s    | ?%          |
```

### 3. Test Results
- Output from all 5 test protocols
- Confirmation that all data matches baseline
- Confirmation of no regressions

### 4. Summary
- List of optimizations applied
- Explanation of why they improve performance
- Any trade-offs or limitations

---

## 🎓 Learning Resources

### Key Files to Study
1. **Participant Bot (Reference Implementation):**
   - `/src/bots/forusall-scrape-participant/runFlow.js` - Study navigation patterns
   - `/src/extractors/forusall-participant/registry.js` - Study module handling

2. **Engine Utilities:**
   - `/src/engine/browser.js` - Understand page pooling
   - `/src/engine/utils/select.js` - Selector utilities
   - `/src/engine/auth/loginOtp.js` - Auth flow timing

3. **Playwright Best Practices:**
   - Prefer `waitForSelector` over `waitForTimeout`
   - Use `{ state: 'visible' }` or `{ state: 'attached' }` for faster waits
   - Reduce timeout values aggressively
   - Use `page.evaluate()` for batch operations

---

## 🚀 Getting Started

### Step-by-Step Workflow

1. **Read PROJECT_STRUCTURE.md** (as per workspace rules)
   ```bash
   # This is MANDATORY before starting
   ```

2. **Read relevant FOLDER_CONTEXT.md files:**
   - `/src/bots/FOLDER_CONTEXT.md`
   - `/src/extractors/FOLDER_CONTEXT.md`
   - `/src/providers/FOLDER_CONTEXT.md`

3. **Analyze current implementation** (detailed reading):
   - `src/bots/forusall-scrape-plan/runFlow.js` (all 533 lines)
   - `src/extractors/forusall-plan/registry.js`
   - All extractor modules

4. **Study reference implementation:**
   - `src/bots/forusall-scrape-participant/runFlow.js`
   - Compare navigation patterns line-by-line

5. **Identify optimizations:**
   - Document all findings in comments or a separate file

6. **Implement optimizations:**
   - Start with low-risk changes (reduce waits)
   - Test after each change
   - Commit working versions incrementally

7. **Run exhaustive tests:**
   - All 5 test protocols
   - Verify data accuracy
   - Check for regressions

8. **Document results:**
   - Performance report
   - Summary of changes

---

## ✨ Example Optimization Patterns

### Pattern 1: Remove Artificial Wait
```javascript
// BEFORE (slow)
await page.click(spec.navSelector);
await page.waitForTimeout(500);  // ← Remove this
await page.waitForSelector(spec.ready.selector, { timeout: 3000 });
await page.waitForTimeout(200);  // ← Remove this

// AFTER (fast)
await page.click(spec.navSelector);
await page.waitForSelector(spec.ready.selector, { 
  timeout: 1000,  // ← Reduced from 3000ms
  state: 'visible'  // ← More specific
});
```

### Pattern 2: Batch Extraction
```javascript
// BEFORE (slow - multiple evaluate calls)
for (const module of modules) {
  await navigateToTab(module);
  const data = await page.evaluate(() => extractData());
}

// AFTER (fast - single evaluate call)
const allData = await page.evaluate((moduleSpecs) => {
  const results = {};
  for (const spec of moduleSpecs) {
    // Click tab programmatically (instant)
    document.querySelector(spec.navSelector)?.click();
    // Extract immediately
    results[spec.key] = extractFromPanel(spec.panelSelector);
  }
  return results;
}, moduleSpecs);
```

---

## 📞 Questions?

If unclear about any requirement:
1. Re-read the workspace rules in `always_applied_workspace_rules`
2. Study the reference implementation (`forusall-scrape-participant`)
3. Check `PROJECT_STRUCTURE.md` for project navigation
4. Review `FOLDER_CONTEXT.md` files for folder-specific guidance

**Goal:** Achieve 10x performance improvement while maintaining 100% accuracy.

Good luck! 🚀

