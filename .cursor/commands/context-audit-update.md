---
tags: [folder-context, audit, documentation, maintenance]
---

# Folder Context Audit & Synchronization Task

**Agent**: Claude Sonnet 4.5  
**Priority**: CRITICAL  
**Time Allocation**: UNLIMITED  
**Estimated Tool Calls**: 300-500+  
**Execution Mode**: FULLY AUTOMATED

---

## 🎯 Mission Statement

Perform a comprehensive, systematic audit of all FOLDER_CONTEXT.md files against the actual codebase to ensure **100% accuracy and completeness**. Identify discrepancies, outdated information, and missing content. Then update ALL context files to perfectly reflect the current state of the repository.

This is a **critical documentation accuracy task** where:
- ✅ Quality > Speed
- ✅ Thoroughness is mandatory
- ✅ Every file and folder must be analyzed
- ✅ No assumptions - verify everything
- ✅ All context files must be synchronized

---

## 📋 Task Overview

### Phase 1: Deep Analysis (READ-ONLY)
1. **Inventory**: Catalog ALL folders, files, and their purposes
2. **Read Context Files**: Load all existing FOLDER_CONTEXT.md files
3. **Compare**: Match reality vs documentation
4. **Identify Gaps**: Document all discrepancies

### Phase 2: Planning
5. **Assess**: Categorize findings (missing, outdated, incorrect)
6. **Prioritize**: Order updates by importance
7. **Strategy**: Plan update approach for each context file

### Phase 3: Execution (WRITE-ONLY to FOLDER_CONTEXT.md)
8. **Update**: Systematically update each FOLDER_CONTEXT.md
9. **Verify**: Cross-check all updates
10. **Finalize**: Ensure consistency across all files

---

## 🔒 Critical Rules

### ✏️ WRITE PERMISSIONS (ONLY These Files)
You may **ONLY MODIFY** these files:
```
✏️  /FOLDER_CONTEXT.md
✏️  /src/FOLDER_CONTEXT.md
✏️  /src/bots/FOLDER_CONTEXT.md
✏️  /src/engine/FOLDER_CONTEXT.md
✏️  /src/engine/utils/FOLDER_CONTEXT.md
✏️  /src/extractors/FOLDER_CONTEXT.md
✏️  /src/providers/FOLDER_CONTEXT.md
✏️  /src/middleware/FOLDER_CONTEXT.md
✏️  /src/routes/FOLDER_CONTEXT.md
✏️  /docs/FOLDER_CONTEXT.md
✏️  /migrations/FOLDER_CONTEXT.md
✏️  /scripts/FOLDER_CONTEXT.md
✏️  /examples/FOLDER_CONTEXT.md
✏️  /forusall-portal-html-data/FOLDER_CONTEXT.md
```

### 🔍 READ-ONLY (Everything Else)
- All source code files (.js, .mjs, .ts)
- All configuration files (.json, .yaml, .yml)
- All documentation files (except FOLDER_CONTEXT.md)
- All test files
- All HTML/CSS/image files

**NEVER modify code, configs, or non-context documentation.**

---

## 📐 Phase 1: Discovery & Deep Analysis

### Step 1.1: Root Directory Inventory

**Objective**: Catalog all files and folders in project root.

**Actions**:
1. List `/` directory contents
2. For each file/folder, document:
   - Name
   - Type (file/directory)
   - Purpose
   - Current status (is it mentioned in FOLDER_CONTEXT.md?)

3. Read `/FOLDER_CONTEXT.md`
4. Compare inventory vs context file:
   - ✅ Files mentioned and exist
   - ⚠️ Files mentioned but don't exist (outdated)
   - ❌ Files exist but not mentioned (missing)

**Document Findings**:
```markdown
## Root Directory Audit

### Files Listed in Context:
- package.json ✅ (exists, purpose documented)
- Dockerfile ✅ (exists, purpose documented)
- .gitignore ⚠️ (exists but description outdated - missing new entries)

### Files Missing from Context:
- render.yaml ❌ (exists but NOT documented)
- presentation.pdf ❌ (exists but NOT documented)

### Outdated Information:
- Context says "Express 4.x" but code uses Express 5.x
- Context lists 5 bots but code has 6 bots

### Action Plan:
1. Add missing files to "Key Files" section
2. Update Express version reference
3. Update bot count
```

---

### Step 1.2: Source Code Structure Analysis

**Objective**: Deep dive into `/src/` directory structure.

**Actions**:
1. Read `/src/FOLDER_CONTEXT.md`
2. List all files in `/src/`:
   - `index.js` - Document its actual purpose
   - `server.js` - Document its actual purpose
   - `config.js` - Document what it exports

3. For each subdirectory in `/src/`:
   - Document what exists
   - Compare with context file claims
   - Note any new folders
   - Note any removed folders

**Verification Checklist**:
- [ ] Entry points correctly described?
- [ ] All subdirectories listed?
- [ ] Import patterns accurate?
- [ ] Architecture diagram matches reality?

---

### Step 1.3: Bots Directory Deep Analysis

**Objective**: Audit `/src/bots/FOLDER_CONTEXT.md` against actual bots.

**Actions**:
1. List ALL directories in `/src/bots/`
2. For EACH bot directory:
   ```
   a) Read routes.js
      - Extract endpoint path
      - Extract HTTP method
      - Extract middleware
   
   b) Read controller.js
      - Extract validation logic
      - Extract job submission pattern
      - Extract response format
   
   c) Read runFlow.js
      - Extract stages used
      - Extract dependencies
      - Extract return structure
   
   d) Check for subdirectories (e.g., /flows/)
   ```

3. Read `/src/bots/FOLDER_CONTEXT.md`
4. Compare **EACH bot** listed in context vs reality:

**Bot-by-Bot Verification**:
```markdown
### forusall-upload
Context says: "POST /forusbot/vault-file-upload"
Reality: ✅ MATCHES (verified in routes.js)

Context says: "Binary upload with x-filename header"
Reality: ✅ MATCHES (verified in controller.js lines 45-67)

Context says: "Uses queue.submit()"
Reality: ✅ MATCHES (verified in controller.js line 89)

Missing from context:
- ❌ Dry-run endpoint: POST /forusbot/sandbox/vault-file-upload
- ❌ New validation: rejects "Document Missing" status with file
- ❌ Evidence capture: saveEvidence() in runFlow.js

### forusall-scrape-participant
Context says: "Extracts 5 modules"
Reality: ⚠️ OUTDATED - Now supports 6 modules (added MFA)

Missing from context:
- ❌ New module: mfa
- ❌ Field filtering feature
- ❌ Year tokenization in payroll module

### forusall-emailtrigger
Reality: ❌ ENTIRE BOT MISSING FROM CONTEXT FILE
- Endpoint: POST /forusbot/emailtrigger
- Has /flows/ subdirectory
- Supports multiple email types
```

**Expected Bots** (verify ALL exist and are documented):
- [ ] forusall-upload
- [ ] forusall-scrape-participant
- [ ] forusall-mfa-reset
- [ ] forusall-search-participants
- [ ] forusall-update-participant
- [ ] forusall-emailtrigger
- [ ] ??? (discover if more exist)

---

### Step 1.4: Engine Directory Deep Analysis

**Objective**: Audit `/src/engine/FOLDER_CONTEXT.md` against actual engine modules.

**Actions**:
1. List ALL files in `/src/engine/`
2. List ALL subdirectories in `/src/engine/`
3. For EACH file, read and extract:
   - Exported functions
   - Key dependencies
   - Environment variables used
   - Purpose/role

**Files to Audit**:
```
auth/loginOtp.js
├── Read entire file
├── Document exported functions
├── Note breaking changes from context description
└── Verify example code still works

browser.js
├── Check for launchContext() vs launchBrowser()
├── Verify PERSISTENT_CONTEXT support
├── Check environment variables
└── Note any new features

sharedContext.js
├── Verify page pooling implementation
├── Check asset blocking features
├── Verify environment variables (BLOCK_IMAGES, etc.)
└── Document getPageFromPool() signature

queue.js
├── Verify submit() vs enqueue() APIs
├── Check stages tracking
├── Verify ETA calculation method
└── Document all exported functions

sessions.js
├── Verify storageState handling
├── Check TTL implementation
├── Verify SESSION_REUSE behavior
└── Document file paths

... (continue for ALL engine files)
```

4. Read `/src/engine/FOLDER_CONTEXT.md`
5. Compare module-by-module

**Findings Template**:
```markdown
### audit.js
Context Status: ⚠️ PARTIALLY DOCUMENTED
Missing: trackEvent() function, database schema
Outdated: Connection pool configuration
New: Metrics aggregation features

### normalizer.js
Context Status: ❌ NOT DOCUMENTED AT ALL
Needs: Complete module documentation
Functions: normalizeResultEnvelope(), bot-specific normalizers
```

---

### Step 1.5: Engine Utils Deep Analysis

**Objective**: Audit `/src/engine/utils/FOLDER_CONTEXT.md` against actual utilities.

**Actions**:
1. List ALL files in `/src/engine/utils/`
2. For EACH utility file:
   ```
   Read file completely
   Extract ALL exported functions
   Document function signatures
   Document parameters
   Document return values
   Note usage examples
   Identify dependencies
   ```

3. Read `/src/engine/utils/FOLDER_CONTEXT.md`
4. Verify EACH utility is documented:

**Utility Verification**:
```markdown
### select.js
Context says: "waitForOptionFlex(), selectByText()"
Reality: ✅ MATCHES

Context example code:
```javascript
const idx = await waitForOptionFlex(page, '#caption', 'Desired Option', 20000);
```
Reality: ✅ SIGNATURE MATCHES (verified line 4-44)

Missing from context:
- ❌ Unicode normalization details
- ❌ Fuzzy matching algorithm explanation

### verify.js
Context says: "waitForFormCleared(), verifyFormDefaults()"
Reality: ✅ MATCHES

Context parameters: { fsel, fileInputSel, filled }
Reality: ✅ MATCHES (verified line 17)

Missing from context:
- ❌ pollMs parameter (new in v2.2.0)
- ❌ captionOtherText support

### date.js
Context Status: ✅ COMPLETE
No issues found.

### pdf.js
Context says: "setPdfTitle() validates PDF header"
Reality: ✅ MATCHES (verified line 20)

### url.js
Context says: "buildUploadUrl() interpolates {planIdNumber}"
Reality: ✅ MATCHES

Missing utility files:
- ❌ No context for any additional utilities (if they exist)
```

---

### Step 1.6: Extractors Deep Analysis

**Objective**: Audit `/src/extractors/FOLDER_CONTEXT.md` against actual extractors.

**Actions**:
1. List ALL files in `/src/extractors/forusall-participant/modules/`
2. Read `registry.js` to understand registration
3. For EACH extractor module:
   ```
   Read complete file
   Document exported function signature
   Document SUPPORTED_FIELDS (if exists)
   Document FIELD_POLICY (if exists)
   Document special features
   Identify all extracted fields
   Note data transformations
   ```

4. Read `/src/extractors/FOLDER_CONTEXT.md`
5. Verify EACH extractor module:

**Extractor Verification Template**:
```markdown
### census.js
Context says: "Extracts 15 fields"
Reality: ⚠️ Count fields in SUPPORTED_FIELDS array
  Actual count: 19 fields ← OUTDATED

Context lists fields: firstName, lastName, ssn...
Reality: ✅ Compare against actual SUPPORTED_FIELDS export
  Missing from context: employeeId, middleName

Context says: "SSN reveal controlled by REVEAL_FULL_SSN"
Reality: ✅ MATCHES (verified lines 67-92)

Context says: "Date format MM/DD/YYYY → YYYY-MM-DD"
Reality: ✅ MATCHES (verified parseDate function)

### payroll.js
Context says: "Supports year tokens"
Reality: ✅ MATCHES (years:all, years:2024, years:last3)

Missing from context:
- ❌ New token format: years:range:2020-2023
- ❌ Metadata object structure
- ❌ Error handling for invalid years

### mfa.js
Context Status: ⚠️ BRIEFLY MENTIONED
Reality: Full extractor exists but barely documented
Needs: Complete documentation of:
  - status field extraction
  - enrolledDate parsing
  - Possible status values
```

---

### Step 1.7: Providers Deep Analysis

**Objective**: Audit `/src/providers/FOLDER_CONTEXT.md` against actual config.

**Actions**:
1. Read `/src/providers/forusall/config.js` COMPLETELY
2. Document EVERY selector in FIXED export:
   ```
   Count total selectors
   Categorize by purpose:
     - Authentication selectors
     - Upload form selectors
     - MFA selectors
     - Search selectors
     - Email trigger selectors
     - Participant selectors
   ```

3. Read `/src/providers/forusall/participantMap.js`
   - Document all module specs
   - Note navigation patterns

4. Read `/src/providers/FOLDER_CONTEXT.md`
5. Cross-reference EVERY selector

**Selector Audit**:
```markdown
### Authentication Selectors
Context lists:
- user: '#user_email' ✅
- pass: '#user_password' ✅
- loginButton: '#new_user > input.btn.btn-primary' ✅
- otpInput: '#otp_attempt' ✅
- otpSubmit: (long selector) ✅

Missing from context:
- ❌ otpInputsAlt array (8 alternative selectors)
- ❌ otpSubmitAlt array

### Upload Form Selectors
Context lists: (verify ALL)
- fileInput ✅
- fileSubmit ✅
- form.section ✅
- form.caption ✅
- form.status ✅
- form.effectiveDate ✅
- form.customCaption ✅
- form.container ✅

All match reality.

### MFA Reset Selectors
Context Status: ✅ COMPLETE
- mfaReset.panel
- mfaReset.status
- mfaReset.resetButton
All documented.

### Email Trigger Selectors
Context Status: ❌ MISSING ENTIRELY
Reality: ~30+ selectors in triggerEmails object
  - form, planSelect, emailTypeSelect
  - statementYear, statementQuarter
  - sponsorYear, sponsorQuarter
  - audEnrolled, audNotEnrolled
  - genericCommType, otherEmailType
  - ... many more

NEEDS: Complete section in context file

### Participant Search Selectors
Context Status: ✅ DOCUMENTED
Verify against participantSearch.selectors:
  - shell ✅
  - inputs.* ✅
  - searchBtn ✅
  - table ✅
  All match.
```

---

### Step 1.8: Middleware Deep Analysis

**Objective**: Audit `/src/middleware/FOLDER_CONTEXT.md` against auth.js.

**Actions**:
1. Read `/src/middleware/auth.js` COMPLETELY
2. Document ALL exported functions:
   - requireUser (default export)
   - requireAdmin
   - resolveRole
   - listUsersPublic
   - _getIdentity (internal)
   - _tokenMetaCount (debug)
   - _tokensPath (debug)

3. Document token loading mechanism:
   - File search order
   - JSON format support (array vs object)
   - Token structure

4. Read `/src/middleware/FOLDER_CONTEXT.md`
5. Verify accuracy:

**Middleware Verification**:
```markdown
### Exported Functions
Context lists:
1. requireUser ✅
2. requireAdmin ✅
3. resolveRole ✅
4. listUsersPublic ✅

Missing from context:
- ❌ Debug utilities (_getIdentity, _tokenMetaCount, _tokensPath)

### Token Format
Context shows: Array format ✅
Context shows: Object format ✅

Missing from context:
- ❌ Token metadata (name, email, id) usage
- ❌ Profile image path generation

### Authentication Flow
Context describes: Header extraction ✅
Context describes: Bearer token support ✅

Missing from context:
- ❌ Cookie-based auth flow (forusbot_admin, forusbot_token)
- ❌ server.js cookie injection

### Token File Loading
Context mentions: TOKENS_FILE, NODE_ENV
Reality: ✅ MATCHES

Missing from context:
- ❌ TOKENS_FILENAME environment variable
- ❌ Exact search order with examples
```

---

### Step 1.9: Routes Deep Analysis

**Objective**: Audit `/src/routes/FOLDER_CONTEXT.md` against all route files.

**Actions**:
1. Read `/src/routes/index.js` COMPLETELY
2. Document EVERY endpoint:
   ```
   Path: /forusbot/health
   Method: GET
   Auth: None
   Purpose: Health check
   Response: { ok: true }
   
   Path: /forusbot/status
   Method: GET
   Auth: Configurable (statusPublic flag)
   Purpose: Queue status + locks
   Response: { running, queue, locks, ... }
   
   ... (document ALL endpoints)
   ```

3. Read ALL route files in `/src/routes/`:
   - admin-auth.js
   - admin-jobs-db.js
   - admin-metrics-db.js
   - data-jobs-db.js
   - data-metrics-db.js
   - articles-files.js
   - articles-draft.js

4. Read `/src/routes/FOLDER_CONTEXT.md`
5. Compare endpoint by endpoint

**Route Verification**:
```markdown
### Core Endpoints (from index.js)
Context lists:
- GET /health ✅
- GET /forusbot/health ✅
- GET /forusbot/status ✅ (but missing configurable auth detail)
- GET /forusbot/whoami ✅
- GET /forusbot/jobs ✅
- GET /forusbot/jobs/:id ✅
- DELETE /forusbot/jobs/:id ✅

Admin endpoints:
- GET /forusbot/locks ✅
- GET /forusbot/settings ✅
- PATCH /forusbot/settings ✅
- GET /forusbot/metrics ✅
- GET /forusbot/version ✅
- GET /forusbot/openapi ✅

Missing from context:
- ❌ POST /forusbot/_close (admin, closes shared context)
- ❌ POST /forusbot/sandbox/vault-file-upload (dry-run)

### Bot Mounts
Context lists all 6 bots: ✅ VERIFY
- /vault-file-upload
- /scrape-participant
- /search-participants
- /mfa-reset
- /emailtrigger
- /update-participant

### Admin Auth Routes (admin-auth.js)
Missing from context:
- ❌ POST /forusbot/admin/login
- ❌ POST /forusbot/admin/logout
- ❌ GET /forusbot/admin/whoami

### Articles Routes (articles-files.js)
Context Status: ⚠️ BRIEFLY MENTIONED
Reality: Full CRUD API exists
Missing endpoints:
- GET /forusbot/articles
- GET /forusbot/articles/:id
- POST /forusbot/articles
- PUT /forusbot/articles/:id
- DELETE /forusbot/articles/:id

### Articles Draft Routes (articles-draft.js)
Context Status: ❌ NOT DOCUMENTED
Missing endpoints:
- GET /forusbot/articles-draft
- POST /forusbot/articles-draft
- PUT /forusbot/articles-draft/:id
- DELETE /forusbot/articles-draft/:id
- POST /forusbot/articles-draft/:id/publish
```

---

### Step 1.10: Documentation Analysis

**Objective**: Audit `/docs/FOLDER_CONTEXT.md` against actual docs structure.

**Actions**:
1. List ALL files and directories in `/docs/`
2. Catalog structure:
   - HTML files (index.html at various levels)
   - JavaScript files (by section)
   - CSS files
   - Images
   - OpenAPI spec
   - Knowledge base structure

3. Read `/docs/FOLDER_CONTEXT.md`
4. Verify structure documentation:

**Docs Structure Verification**:
```markdown
### Main Files
Context lists:
- index.html ✅
- openapi.yaml ✅
- images/ ✅

### API Reference
Context says: "Available in EN and ES"
Reality: ✅ MATCHES
- /api/index.html (EN)
- /api/es/index.html (ES)

### Sandbox
Context says: "Interactive testing UI (EN/ES)"
Reality: ✅ MATCHES
- /sandbox/index.html
- /sandbox/es/index.html

Structure:
- /sandbox/js/core/ ✅
- /sandbox/js/endpoints/ ✅

### Admin Console
Context lists: index.html, js/, styles.css
Reality: ✅ MATCHES

JavaScript structure:
- admin-api.js ✅
- components/*.js ✅
- lib/chart.js ✅

### Knowledge Base
Context mentions: Articles, builder, search
Reality: ✅ MATCHES

Missing from context:
- ❌ Detailed builder components structure
- ❌ Draft vs published article flow
- ❌ People profile images path

### OpenAPI Spec
Context says: "Version 2.2.0, source of truth"
Reality: ✅ VERIFY VERSION NUMBER in openapi.yaml
```

---

### Step 1.11: Migrations Analysis

**Objective**: Audit `/migrations/FOLDER_CONTEXT.md` against SQL files.

**Actions**:
1. List ALL .sql files in `/migrations/`
2. Read EACH migration file header/comments
3. Document purpose of each
4. Read `/migrations/FOLDER_CONTEXT.md`
5. Verify each migration is documented:

**Migration Verification**:
```markdown
Migrations listed in context:
1. 001_init.sql ✅
2. 002_views.sql ✅
3. 003_alias_views.sql ✅
4. 004_reset_schema.sql ✅
5. 005_ms_durations.sql ✅
6. 006_job_stages_dedupe.sql ✅

Additional migrations found:
- ❌ 007_*.sql (if exists)
- ❌ 008_*.sql (if exists)

For each migration, verify context includes:
- Purpose ✅ / ❌
- What it creates/modifies ✅ / ❌
- When to apply ✅ / ❌
- Breaking changes ✅ / ❌
```

---

### Step 1.12: Scripts Analysis

**Objective**: Audit `/scripts/FOLDER_CONTEXT.md` against actual scripts.

**Actions**:
1. List ALL files in `/scripts/`
2. Read EACH script to understand purpose
3. Read `/scripts/FOLDER_CONTEXT.md`
4. Verify documentation:

**Scripts Verification**:
```markdown
Scripts listed in context:
- healthcheck.sh ✅
- audit-smoke.js ✅
- validate-jobs.mjs ✅
- validate-jobs-deep.mjs ✅

Additional scripts found:
- ❌ (check for any new scripts)

For each script, verify context includes:
- Purpose ✅ / ❌
- Usage instructions ✅ / ❌
- Exit codes ✅ / ❌
- Environment variables ✅ / ❌
- When to use ✅ / ❌
```

---

### Step 1.13: Examples Analysis

**Objective**: Audit `/examples/FOLDER_CONTEXT.md` against example files.

**Actions**:
1. List ALL files in `/examples/`
2. Read each example file
3. Read `/examples/FOLDER_CONTEXT.md`
4. Verify:

**Examples Verification**:
```markdown
Examples listed in context:
- curl.sh ✅
- forus-bot-n8n.json ✅

Additional examples found:
- ❌ (check for any new examples)

For each example, verify context includes:
- Purpose ✅ / ❌
- How to use ✅ / ❌
- Prerequisites ✅ / ❌
- Expected output ✅ / ❌
```

---

### Step 1.14: HTML Fixtures Analysis

**Objective**: Audit `/forusall-portal-html-data/FOLDER_CONTEXT.md`.

**Actions**:
1. List ALL subdirectories in `/forusall-portal-html-data/`
2. List ALL .html files
3. Document what each fixture represents
4. Read context file
5. Verify:

**Fixtures Verification**:
```markdown
Directories listed in context:
- plans data/ ✅

Additional directories found:
- ❌ participants data/ (if exists)
- ❌ documents data/ (if exists)
- ❌ (check for others)

HTML files in plans data/:
- Sample1.html ✅
- Sample2.html ✅
- Sample3.html? ❌ (check)

For each directory, verify context explains:
- What portal module it represents ✅ / ❌
- How to use fixtures ✅ / ❌
- When to update ✅ / ❌
```

---

## 📊 Phase 2: Analysis & Planning

### Step 2.1: Consolidate All Findings

**Objective**: Create master audit report.

**Actions**:
1. Review all findings from Phase 1
2. Categorize by severity:
   ```
   🔴 CRITICAL (Missing entire sections):
   - /src/bots/FOLDER_CONTEXT.md missing forusall-emailtrigger
   - /src/providers/FOLDER_CONTEXT.md missing email trigger selectors
   - /src/routes/FOLDER_CONTEXT.md missing admin-auth endpoints
   
   🟠 HIGH (Outdated information):
   - /src/extractors/FOLDER_CONTEXT.md field counts wrong
   - /src/engine/FOLDER_CONTEXT.md missing new features
   - Root FOLDER_CONTEXT.md Express version wrong
   
   🟡 MEDIUM (Missing details):
   - /src/engine/utils/FOLDER_CONTEXT.md missing parameters
   - /src/middleware/FOLDER_CONTEXT.md missing debug functions
   
   🟢 LOW (Minor improvements):
   - Add more examples
   - Clarify existing descriptions
   ```

3. Count total issues per context file:
   ```markdown
   ## Issues Summary
   
   /FOLDER_CONTEXT.md: 5 issues (2 critical, 3 high)
   /src/FOLDER_CONTEXT.md: 2 issues (1 high, 1 medium)
   /src/bots/FOLDER_CONTEXT.md: 8 issues (3 critical, 5 high)
   /src/engine/FOLDER_CONTEXT.md: 12 issues (4 high, 8 medium)
   /src/engine/utils/FOLDER_CONTEXT.md: 6 issues (4 medium, 2 low)
   /src/extractors/FOLDER_CONTEXT.md: 9 issues (2 high, 7 medium)
   /src/providers/FOLDER_CONTEXT.md: 15 issues (5 critical, 10 high)
   /src/middleware/FOLDER_CONTEXT.md: 4 issues (2 medium, 2 low)
   /src/routes/FOLDER_CONTEXT.md: 11 issues (4 critical, 7 high)
   /docs/FOLDER_CONTEXT.md: 3 issues (3 medium)
   /migrations/FOLDER_CONTEXT.md: 1 issue (1 low)
   /scripts/FOLDER_CONTEXT.md: 0 issues ✅
   /examples/FOLDER_CONTEXT.md: 1 issue (1 low)
   /forusall-portal-html-data/FOLDER_CONTEXT.md: 2 issues (2 medium)
   
   TOTAL: 79 issues
   ```

---

### Step 2.2: Prioritize Updates

**Objective**: Order context files by update urgency.

**Priority Order**:
```
1. 🔴 /src/providers/FOLDER_CONTEXT.md (15 issues, critical)
2. 🔴 /src/engine/FOLDER_CONTEXT.md (12 issues, high impact)
3. 🔴 /src/routes/FOLDER_CONTEXT.md (11 issues, critical)
4. 🔴 /src/extractors/FOLDER_CONTEXT.md (9 issues, high)
5. 🔴 /src/bots/FOLDER_CONTEXT.md (8 issues, critical)
6. 🟠 /src/engine/utils/FOLDER_CONTEXT.md (6 issues, medium)
7. 🟠 /FOLDER_CONTEXT.md (5 issues, high)
8. 🟠 /src/middleware/FOLDER_CONTEXT.md (4 issues, medium)
9. 🟠 /docs/FOLDER_CONTEXT.md (3 issues, medium)
10. 🟡 /src/FOLDER_CONTEXT.md (2 issues)
11. 🟡 /forusall-portal-html-data/FOLDER_CONTEXT.md (2 issues)
12. 🟢 /migrations/FOLDER_CONTEXT.md (1 issue)
13. 🟢 /examples/FOLDER_CONTEXT.md (1 issue)
14. ✅ /scripts/FOLDER_CONTEXT.md (0 issues)
```

---

### Step 2.3: Plan Update Strategy

**Objective**: Define approach for each context file update.

**For EACH context file, plan**:

```markdown
## /src/providers/FOLDER_CONTEXT.md Update Plan

### Issues to Address:
1. Add complete email trigger selectors section
2. Update authentication selectors (add alternatives)
3. Document participant search selectors structure
4. Add timeout configuration details
5. Update URLs section

### Sections to Add:
- Email Trigger Selectors (NEW)
  - Form selectors
  - Statement selectors
  - Sponsor email selectors
  - Audience selectors
  - Generic email selectors

### Sections to Update:
- Authentication Selectors
  - Add otpInputsAlt array documentation
  - Add otpSubmitAlt array documentation
- Upload Form Selectors
  - Verify all are still accurate
  - Add validation notes

### Sections to Keep As-Is:
- MFA Reset Selectors ✅
- Best Practices ✅
- Selector Priority ✅

### Approach:
1. Read current file completely
2. Create updated version with all changes
3. Preserve working examples
4. Add new examples for new sections
5. Verify all selector paths against config.js
6. Ensure consistency with project patterns
```

**Repeat this planning for ALL 14 context files.**

---

## ✏️ Phase 3: Execution (Update Context Files)

### Step 3.1: Update Priority 1 Files

**Start with the highest priority context files.**

**For EACH file**:

#### Before Updating:
1. Read current FOLDER_CONTEXT.md completely
2. Read your findings/plan for this file from Phase 2
3. Note current structure and sections

#### During Update:
1. **Preserve Good Content**: Keep accurate sections
2. **Update Outdated**: Correct wrong information
3. **Add Missing**: Insert new sections for gaps
4. **Remove Obsolete**: Delete truly outdated content
5. **Maintain Format**: Keep markdown structure consistent
6. **Keep Examples**: Preserve working code examples
7. **Add Examples**: Create examples for new content

#### Quality Standards:
- ✅ Every file, folder, function mentioned EXISTS in codebase
- ✅ All code examples are ACCURATE (test syntax)
- ✅ All imports/paths are CORRECT
- ✅ Version numbers are CURRENT
- ✅ Environment variables are ACCURATE
- ✅ Selector paths match providers/forusall/config.js
- ✅ Function signatures match actual code
- ✅ Response formats match normalizer.js patterns

#### Structure to Maintain:
```markdown
# /path/to/folder/ - Title Context

## Purpose
Clear, concise purpose statement

## What's Here
Detailed inventory

## Key Files (if applicable)
File-by-file breakdown

## When to Work Here
Clear guidance on when to modify

## DO NOT Work Here For
Clear boundaries

## Best Practices
Folder-specific guidelines

## Common Patterns
Code examples

## Testing
How to test

## Dependencies
What this depends on

## Future Enhancements
Ideas for improvements
```

---

### Step 3.2: Update Each Context File Systematically

**Process for EACH of 14 context files**:

```
1. /src/providers/FOLDER_CONTEXT.md
   └─ Apply findings, add missing sections, update outdated

2. /src/engine/FOLDER_CONTEXT.md
   └─ Apply findings, add missing sections, update outdated

3. /src/routes/FOLDER_CONTEXT.md
   └─ Apply findings, add missing sections, update outdated

4. /src/extractors/FOLDER_CONTEXT.md
   └─ Apply findings, add missing sections, update outdated

5. /src/bots/FOLDER_CONTEXT.md
   └─ Apply findings, add missing sections, update outdated

6. /src/engine/utils/FOLDER_CONTEXT.md
   └─ Apply findings, add missing sections, update outdated

7. /FOLDER_CONTEXT.md
   └─ Apply findings, add missing sections, update outdated

8. /src/middleware/FOLDER_CONTEXT.md
   └─ Apply findings, add missing sections, update outdated

9. /docs/FOLDER_CONTEXT.md
   └─ Apply findings, add missing sections, update outdated

10. /src/FOLDER_CONTEXT.md
    └─ Apply findings, add missing sections, update outdated

11. /forusall-portal-html-data/FOLDER_CONTEXT.md
    └─ Apply findings, add missing sections, update outdated

12. /migrations/FOLDER_CONTEXT.md
    └─ Apply findings, add missing sections, update outdated

13. /examples/FOLDER_CONTEXT.md
    └─ Apply findings, add missing sections, update outdated

14. /scripts/FOLDER_CONTEXT.md
    └─ Verify (no issues found, but double-check)
```

**After Each Update**:
- ✅ Re-read the updated file
- ✅ Verify all changes were applied
- ✅ Check markdown syntax is correct
- ✅ Verify code examples have proper syntax highlighting

---

### Step 3.3: Cross-File Consistency Check

**Objective**: Ensure consistency across all context files.

**Actions**:
1. **Terminology Check**:
   - All files use same terms (e.g., "bot" not "automation")
   - Consistent capitalization
   - Consistent path formats

2. **Link Validation**:
   - References between context files are accurate
   - "See also" sections point to correct files
   - PROJECT_STRUCTURE.md links are current

3. **Pattern Consistency**:
   - All code examples follow same style
   - All have similar section structures
   - All use same emoji/formatting conventions

4. **Technical Accuracy**:
   - Environment variables consistent across files
   - Import statements match actual code
   - Function signatures consistent

**Create Consistency Report**:
```markdown
## Cross-File Consistency Audit

### Terminology
✅ All files use "bot" consistently
✅ All files use "jobCtx" (not "ctx" or "context")
⚠️  Some files say "participant page", others "participant profile"
   → Fix: Standardize to "participant page"

### References
✅ All references to /src/engine/auth/loginOtp.js are accurate
✅ All references to providers/forusall/config.js are accurate
⚠️  /src/bots/FOLDER_CONTEXT.md references old queue.enqueue()
   → Fix: Update to queue.submit()

### Code Style
✅ All code blocks use proper language tags
✅ All use async/await (not promises)
⚠️  Some examples use single quotes, others double quotes
   → Fix: Standardize to single quotes

### Action Items:
1. Update 3 files with terminology fixes
2. Update 2 files with reference corrections
3. Standardize quote style in examples
```

---

## 🔍 Phase 4: Verification & Quality Assurance

### Step 4.1: Technical Accuracy Verification

**Objective**: Verify every technical claim in all context files.

**For EACH context file, verify**:

#### Code Examples Accuracy:
```markdown
Example from /src/engine/utils/FOLDER_CONTEXT.md:

```javascript
const { waitForOptionFlex } = require('./select');
const idx = await waitForOptionFlex(page, '#caption', 'Agreement', 20000);
```

Verification:
✅ Import path correct? → Check actual file exports
✅ Function exists? → Check select.js exports waitForOptionFlex
✅ Signature matches? → Check function parameters in select.js line 4
✅ Return value correct? → Check function returns index (number)

Result: ✅ ACCURATE
```

**Verify ALL code examples in ALL 14 context files.**

#### File Paths Verification:
```markdown
Context claims:
- "Add to /src/engine/utils/"
- "Register in /src/extractors/forusall-participant/registry.js"
- "Update /src/providers/forusall/config.js"

Verification:
✅ /src/engine/utils/ exists
✅ /src/extractors/forusall-participant/registry.js exists
✅ /src/providers/forusall/config.js exists

Result: ✅ ALL PATHS VALID
```

#### Function Signatures Verification:
```markdown
Context says:
"ensureAuthForTarget(page, { loginUrl, targetUrl, selectors, shellSelectors, jobCtx, saveSession })"

Reality check:
1. Read /src/engine/auth/loginOtp.js
2. Find ensureAuthForTarget function definition
3. Compare parameters

Result: ✅ MATCHES (verified line 309)
```

---

### Step 4.2: Completeness Verification

**Objective**: Ensure no files/folders/features are missing from context.

**Re-check inventories**:

```markdown
## Root Directory
Files in context: 8 files
Files in reality: 8 files
Missing: 0 ✅

## /src/bots/
Bots in context: 6 bots
Bots in reality: 6 bots
Missing: 0 ✅

## /src/engine/
Files in context: 11 modules
Files in reality: 11 modules
Missing: 0 ✅

## /src/engine/utils/
Utils in context: 5 utilities
Utils in reality: 5 utilities
Missing: 0 ✅

... (verify all folders)

## Completeness Score: 100% ✅
```

---

### Step 4.3: Consistency Verification

**Objective**: Ensure all cross-references are valid.

**Check**:
1. When context file A mentions file/folder B, B exists
2. When A says "see B's context", B's context exists and has that info
3. No circular contradictions

**Examples**:
```markdown
/src/bots/FOLDER_CONTEXT.md says:
"Use utilities from /src/engine/utils/"

Verification:
✅ /src/engine/utils/FOLDER_CONTEXT.md documents those utilities
✅ Both files use consistent naming
✅ Import examples are consistent

/src/extractors/FOLDER_CONTEXT.md says:
"Selectors come from /src/providers/forusall/config.js"

Verification:
✅ /src/providers/FOLDER_CONTEXT.md documents that file
✅ Both reference same selector names
✅ No contradictions

Result: ✅ CONSISTENT
```

---

### Step 4.4: PROJECT_STRUCTURE.md Sync Check

**Objective**: Ensure PROJECT_STRUCTURE.md reflects all context file updates.

**Actions**:
1. Read PROJECT_STRUCTURE.md
2. For each folder mentioned:
   - Verify description matches FOLDER_CONTEXT.md
   - Verify file counts are accurate
   - Verify "When to Work Here" aligns
   - Verify "DO NOT" boundaries align

3. Update PROJECT_STRUCTURE.md if needed:
   ```markdown
   Example: If we added email trigger selectors to providers context,
   ensure PROJECT_STRUCTURE.md mentions this in the providers section.
   ```

4. Verify "Quick Navigation Guide" is still accurate
5. Update statistics if changed

---

### Step 4.5: Final Review Checklist

**Go through this checklist for EVERY context file**:

```markdown
## /FOLDER_CONTEXT.md
- [ ] All files mentioned exist in reality
- [ ] All code examples are syntactically correct
- [ ] All imports/paths are accurate
- [ ] All function signatures match code
- [ ] All environment variables are documented
- [ ] No outdated version numbers
- [ ] No missing sections
- [ ] Consistent with other context files
- [ ] Cross-references are valid
- [ ] Examples follow project patterns

## /src/FOLDER_CONTEXT.md
- [ ] All files mentioned exist
- [ ] All subdirectories documented
- [ ] Entry points correctly described
- [ ] Architecture diagram accurate
- [ ] ... (same checklist as above)

## /src/bots/FOLDER_CONTEXT.md
- [ ] All 6 bots documented
- [ ] Each bot's endpoint correct
- [ ] Controller patterns accurate
- [ ] runFlow patterns accurate
- [ ] Examples are current
- [ ] ... (same checklist)

... (repeat for all 14 files)
```

---

## 📊 Phase 5: Final Report & Summary

### Step 5.1: Generate Update Summary

**Create comprehensive summary**:

```markdown
# Folder Context Audit & Update - Final Report

## Execution Summary
- **Start Time**: [timestamp]
- **End Time**: [timestamp]
- **Duration**: [X hours]
- **Tool Calls Used**: [exact count]

## Files Analyzed
- Source files read: [count]
- Context files audited: 14
- Context files updated: [count]
- Total lines changed: [count]

## Issues Found & Resolved

### Critical Issues (Fixed)
1. ✅ forusall-emailtrigger bot missing from /src/bots/FOLDER_CONTEXT.md
   - Added complete documentation
   - Added endpoint details
   - Added flows/ subdirectory info

2. ✅ Email trigger selectors missing from /src/providers/FOLDER_CONTEXT.md
   - Added 30+ selectors
   - Organized by category
   - Added examples

[... list all critical issues fixed ...]

### High Priority Issues (Fixed)
[... list all high issues fixed ...]

### Medium Priority Issues (Fixed)
[... list all medium issues fixed ...]

### Low Priority Issues (Fixed)
[... list all low issues fixed ...]

## Changes by Context File

### /FOLDER_CONTEXT.md
- Updated Express version (4.x → 5.x)
- Added render.yaml description
- Updated bot count (5 → 6)
- Added presentation.pdf mention
- Updated .gitignore contents
**Lines changed**: ~25 lines

### /src/FOLDER_CONTEXT.md
- Updated subdirectory list
- Clarified entry point descriptions
- Updated import conventions
**Lines changed**: ~10 lines

[... detail each file ...]

## Total Impact
- **Context files updated**: 13 of 14
- **New sections added**: [count]
- **Sections updated**: [count]
- **Outdated sections removed**: [count]
- **New code examples**: [count]
- **Total lines added**: [count]
- **Total lines removed**: [count]
- **Net change**: [count] lines

## Verification Results
- ✅ All code examples verified
- ✅ All paths verified
- ✅ All function signatures verified
- ✅ Cross-references validated
- ✅ Consistency achieved
- ✅ PROJECT_STRUCTURE.md synchronized

## Accuracy Score
- **Before audit**: ~72% accurate
- **After updates**: 100% accurate ✅

## Recommendations for Maintenance
1. Re-run this audit quarterly
2. Update context files when adding new features
3. Verify context during code reviews
4. Keep PROJECT_STRUCTURE.md in sync
5. Maintain consistency in terminology

## Conclusion
All FOLDER_CONTEXT.md files have been successfully audited and updated to accurately reflect the current state of the ForUsBots repository. Documentation is now 100% synchronized with code.
```

---

### Step 5.2: Create Quick Reference

**For user convenience**:

```markdown
# Quick Reference: What Changed

## New Documentation Added
- Email trigger bot (complete section)
- Email trigger selectors (30+ selectors)
- Admin authentication endpoints
- Articles CRUD API
- Draft articles API
- OTP alternative selectors
- Debug middleware functions
- MFA extractor details
- Payroll year tokens
- ... [complete list]

## Corrections Made
- Express version: 4.x → 5.x
- Bot count: 5 → 6
- Extractor count: 5 → 6
- Field counts in census extractor
- Queue API: enqueue() → submit()
- ... [complete list]

## Files Most Changed
1. /src/providers/FOLDER_CONTEXT.md (+234 lines)
2. /src/routes/FOLDER_CONTEXT.md (+189 lines)
3. /src/bots/FOLDER_CONTEXT.md (+156 lines)
4. /src/engine/FOLDER_CONTEXT.md (+98 lines)
5. /src/extractors/FOLDER_CONTEXT.md (+87 lines)

## Files Unchanged
- /scripts/FOLDER_CONTEXT.md (already 100% accurate)
```

---

## 🎯 Success Criteria

This task is complete when:

- ✅ ALL 14 FOLDER_CONTEXT.md files have been read and audited
- ✅ ALL discrepancies have been identified and documented
- ✅ ALL context files have been updated to reflect current code
- ✅ ALL code examples in context files are accurate
- ✅ ALL file/folder inventories are complete
- ✅ ALL cross-references between files are valid
- ✅ PROJECT_STRUCTURE.md is synchronized with updates
- ✅ Consistency is achieved across all context files
- ✅ Final report has been generated
- ✅ Verification checklist is 100% complete

---

## 💡 Tips for Efficient Execution

### Batch Reading
- Read multiple related files in parallel when possible
- Group similar files (all bot controllers, all utils, etc.)

### Systematic Approach
- Don't skip folders
- Work through phases in order
- Complete one context file before moving to next

### Accuracy Over Speed
- This is an UNLIMITED time task
- Quality is paramount
- Verify everything
- Don't make assumptions

### Memory Management
- Keep running notes of findings
- Reference your Phase 1 findings during Phase 3 updates
- Build on previous analysis

### Tool Call Optimization
- Read large files completely (don't read in small chunks)
- Update context files in complete rewrites (don't do many small edits)
- Use grep for finding specific patterns across many files

---

## 🚨 Important Reminders

1. **READ-ONLY CODE**: Never modify source code, only FOLDER_CONTEXT.md files
2. **VERIFY EVERYTHING**: Don't assume, check the actual code
3. **COMPLETE AUDIT**: Every folder, every file, every function
4. **ACCURACY**: Context must match reality 100%
5. **CONSISTENCY**: All context files must align
6. **UNLIMITED TIME**: Take as long as needed
7. **QUALITY**: This is critical documentation

---

**BEGIN TASK**: Start with Phase 1, Step 1.1. Work systematically through all phases. Report findings as you go. Take unlimited time. Prioritize accuracy and completeness above all else.

---

**End of Command File**
