# Documentation Audit & Update Task for ForUsBots API

**Agent**: Claude Sonnet 4.5  
**Priority**: HIGH  
**Time Allocation**: UNLIMITED  
**Estimated Tool Calls**: 200-300+  

---

## 🎯 Mission

Perform a comprehensive, systematic audit of the ForUsBots API documentation and update it to accurately reflect the current codebase implementation. This is a **critical accuracy task** where quality and thoroughness are paramount.

---

## 📋 Task Overview

You will:
1. **Discover**: Systematically map ALL endpoints, bots, and routes in the codebase
2. **Audit**: Compare implementation vs documentation across all 6 doc files
3. **Identify**: Document all discrepancies, missing information, and outdated content
4. **Plan**: Create a detailed update strategy with prioritized tasks
5. **Execute**: Update all documentation files with precision and consistency
6. **Verify**: Ensure accuracy, completeness, and synchronization across all docs

---

## 📁 Documentation Files (WRITE-ONLY ZONE)

You may **ONLY MODIFY** these files:

```
✏️  docs/index.html              (EN main documentation)
✏️  docs/es/index.html           (ES main documentation)
✏️  docs/api/index.html          (EN API reference)
✏️  docs/api/es/index.html       (ES API reference)
✏️  docs/openapi.yaml            (OpenAPI spec - SOURCE OF TRUTH)
✏️  README.md                    (Project readme)
```

**All other files are READ-ONLY** for analysis purposes.

---

## 🔍 Phase 1: Discovery & Analysis (READ-ONLY)

### Step 1.1: Map All Bots

**Objective**: Discover every automation bot in the repository.

**Actions**:
1. List all directories in `src/bots/`
2. For each bot directory, read:
   - `routes.js` → Extract endpoint path, HTTP method
   - `controller.js` → Extract request validation, auth requirements
   - `runFlow.js` → Extract response structure, success/error cases

3. Document for each bot:
   ```
   Bot Name: forusall-upload
   Endpoint: POST /forusbot/vault-file-upload
   Auth: Required (x-auth-token)
   Pattern: 202 Accepted with jobId
   Request: Binary body + headers (x-filename, x-meta)
   Response: { ok, jobId, acceptedAt, estimate, capacitySnapshot }
   Special Notes: Uses queue system, async processing
   ```

4. Create comprehensive inventory in working memory

**Expected Bots** (verify and discover more):
- forusall-upload
- forusall-scrape-participant
- forusall-scrape-plan
- forusall-search-participants
- forusall-mfa-reset
- ??? (discover if more exist)

---

### Step 1.2: Map All Routes

**Objective**: Catalog every HTTP endpoint exposed by the server.

**Actions**:
1. Read `src/routes/index.js` line by line
2. Identify ALL registered routes:
   - Admin routes (require admin token)
   - User routes (require auth token)
   - Public routes (no auth)

3. For each route, document:
   ```
   Path: /forusbot/status
   Method: GET
   Middleware: Optional auth (based on flags.statusPublic)
   Namespace: /forusbot
   Query Params: None
   Headers: x-auth-token (optional)
   Response: Queue snapshot, capacity, locks
   ```

4. Map route groupings:
   - Health & status endpoints
   - Bot submission endpoints
   - Job management endpoints
   - Admin endpoints
   - Utility endpoints

---

### Step 1.3: Extract Implementation Details

**Objective**: Understand the precise behavior of each endpoint.

**Actions**:
For each endpoint discovered:

1. **Request Validation**:
   - Read controller validation logic
   - Identify required vs optional fields
   - Note constraints (formats, min/max, enums)
   - Document default values

2. **Response Structures**:
   - Find success response shape in `runFlow.js` or controller
   - Find error response shapes
   - Note conditional fields (e.g., only present when state=running)

3. **Status Codes**:
   - Map when each code is returned:
     - 200 OK → Immediate success
     - 202 Accepted → Async job queued
     - 400 Bad Request → Invalid input
     - 401 Unauthorized → Missing/invalid token
     - 404 Not Found → Resource doesn't exist
     - 409 Conflict → State conflict (e.g., can't cancel running job)
     - 422 Unprocessable Entity → Business logic rejection
     - 500 Internal Server Error → Unexpected error

4. **Headers**:
   - Required headers (x-auth-token, x-filename, etc.)
   - Optional headers (Content-Type, etc.)
   - Custom headers (x-meta, etc.)

5. **Examples**:
   - Look for test files in `tests/` or `__tests__/`
   - Check comments in code for example payloads
   - Note any mock data

---

### Step 1.4: Review Configuration

**Objective**: Document all configurable aspects of the API.

**Actions**:
1. Read `src/config.js`
2. Document all environment variables:
   ```
   PORT: (default: 10000)
   SHARED_TOKEN: (required, no default)
   SITE_USER: (required, portal credentials)
   MAX_CONCURRENCY: (default: 3, adjustable at runtime)
   HEADFUL: (default: 0, 1=show browser)
   etc.
   ```

3. Read `src/engine/settings.js` for runtime settings
4. Note feature flags and their defaults
5. Document timeout values, limits, defaults

---

### Step 1.5: Test Live Endpoints (If Server Running)

**Objective**: Capture real response data for documentation examples.

**Actions**:
If the server is running locally, execute:

```bash
# Test public endpoints
curl -sS http://localhost:10000/health
curl -sS http://localhost:10000/forusbot/health
curl -sS http://localhost:10000/forusbot/status

# Test authenticated endpoints (if token available)
TOKEN="dev-secret"  # Use actual token from .env
curl -sS -H "x-auth-token: $TOKEN" http://localhost:10000/forusbot/whoami
curl -sS -H "x-auth-token: $TOKEN" http://localhost:10000/forusbot/jobs?limit=5
curl -sS -H "x-auth-token: $TOKEN" http://localhost:10000/forusbot/settings
curl -sS -H "x-auth-token: $TOKEN" http://localhost:10000/forusbot/metrics

# Test sandbox dry-run
curl -sS -X POST http://localhost:10000/forusbot/sandbox/vault-file-upload \
  -H "x-filename: test.pdf" \
  -H 'x-meta: {"planId":580,"formData":{"section":"CONTRACTS & AGREEMENTS","caption":"Test","status":"Audit Ready","effectiveDate":"2025-05-02"}}'
```

**Capture**:
- Full response bodies (formatted JSON)
- Response headers
- Status codes
- Any errors encountered

**Use this data** for realistic examples in documentation.

---

## 🔎 Phase 2: Documentation Audit

### Step 2.1: Audit OpenAPI Spec (`docs/openapi.yaml`)

**Objective**: Verify OpenAPI spec is complete and accurate.

**For each endpoint found in code, check**:

| Check | Question | Action if ❌ |
|-------|----------|-------------|
| ✅/❌ | Is endpoint listed in openapi.yaml? | Add missing endpoint |
| ✅/❌ | Is path correct? | Fix path |
| ✅/❌ | Is HTTP method correct? | Fix method |
| ✅/❌ | Are all parameters documented? | Add missing params |
| ✅/❌ | Are parameter types correct? | Fix types |
| ✅/❌ | Is `required` field accurate? | Fix required status |
| ✅/❌ | Is request body schema accurate? | Update schema |
| ✅/❌ | Is response schema accurate? | Update schema |
| ✅/❌ | Are all status codes documented? | Add missing codes |
| ✅/❌ | Are examples provided? | Add examples |
| ✅/❌ | Are descriptions clear and complete? | Enhance descriptions |

**Special Checks**:
- Version number in `info.version` matches actual version
- `$ref` references are valid
- Schema definitions in `components/schemas` are used consistently
- Enum values match code constants

**Create audit log**:
```
❌ /forusbot/update-participant - MISSING ENTIRELY
❌ /forusbot/scrape-plan - response schema missing 'notes' field
⚠️  /forusbot/jobs/{id} - example outdated
✅ /forusbot/health - accurate
```

---

### Step 2.2: Audit API Reference Pages (English)

**File**: `docs/api/index.html`

**For each endpoint, verify**:

1. **Presence**: Is there a `<details>` section for this endpoint?
2. **HTTP Method Badge**: Correct class (get/post/patch/delete)?
3. **Path**: Accurate endpoint path?
4. **Summary**: Clear one-line description?
5. **Description**: Detailed explanation in `op-body`?
6. **Parameters Table**: 
   - All parameters listed?
   - Correct types, required status?
   - Clear descriptions?
7. **Request Body Examples**: 
   - Present and accurate?
   - Valid JSON?
   - Realistic values?
8. **Response Examples**:
   - All status codes shown (200, 202, 400, 401, 404, 422, 500)?
   - Response JSON accurate?
   - Matches actual implementation?
9. **cURL Examples**: 
   - Present?
   - Syntactically correct?
   - Uses placeholders properly?
10. **Internal Links**: Work correctly?
11. **Version Badge**: Matches current version (in header)?

**Create audit log per endpoint**.

---

### Step 2.3: Audit API Reference Pages (Spanish)

**File**: `docs/api/es/index.html`

**Perform same audit as Step 2.2 PLUS**:

12. **Translation Quality**: Spanish text natural and accurate?
13. **Parity Check**: Content matches EN version (not just translation)?
14. **Language Switcher**: Works correctly?
15. **Examples**: Should match EN (JSON payloads same, only descriptions translated)

**Create audit log noting EN/ES discrepancies**.

---

### Step 2.4: Audit Main Docs (English)

**File**: `docs/index.html`

**Sections to audit**:

1. **Overview Section**:
   - Description accurate and current?
   - Version mentioned is correct?

2. **Endpoints Section** (cards grid):
   - All endpoints have cards?
   - Descriptions accurate?
   - Links to API reference work?
   - Cards use correct HTTP method badges?

3. **Bots Section**:
   - All bots documented?
   - Each bot has: description, endpoint, headers table, body schema, responses, cURL example?
   - Tables accurate?
   - Examples tested and working?

4. **Schemas Section**:
   - Schemas match OpenAPI definitions?
   - Examples use realistic data?

5. **Examples Section**:
   - cURL examples work?
   - Cover common use cases?

6. **Environment Section**:
   - All env vars listed?
   - Defaults accurate?

7. **Navigation**:
   - TOC links work?
   - Language switcher works?
   - External links valid?

**Create audit log per section**.

---

### Step 2.5: Audit Main Docs (Spanish)

**File**: `docs/es/index.html`

**Perform same audit as Step 2.4 PLUS parity check with EN version**.

---

### Step 2.6: Audit README

**File**: `README.md`

**Verify**:

1. **Version Number**: Matches code (in title and throughout)?
2. **Endpoints Summary Table**: 
   - All endpoints listed?
   - Auth column accurate?
   - Notes accurate?
3. **Quickstart Section**: Examples work and are current?
4. **New Endpoints Section**: Lists latest features?
5. **Links**: Point to correct doc pages?
6. **Changelog**: Up to date with latest changes?

**Create audit log**.

---

## 📊 Phase 3: Analysis & Planning

### Step 3.1: Consolidate Findings

**Create master discrepancy list**:

```markdown
## Critical Issues (Must Fix)
1. ❌ Missing endpoint: POST /forusbot/update-participant (across ALL docs)
2. ❌ Wrong response schema: POST /forusbot/scrape-plan (missing 'notes' field)
3. ❌ Version mismatch: README shows 2.2.0, code is 2.3.0

## Important Issues (Should Fix)
1. ⚠️  Outdated example: GET /forusbot/jobs/:id response
2. ⚠️  Missing status code: POST /forusbot/scrape-participant 422 response
3. ⚠️  Incomplete description: POST /forusbot/search-participants pagination

## Nice-to-Have (Enhancement)
1. 💡 Add more detailed examples for POST /forusbot/vault-file-upload
2. 💡 Enhance error response documentation
3. 💡 Add troubleshooting section
```

---

### Step 3.2: Create Detailed Update Plan

**Organize by file** with specific line-item tasks:

```markdown
## docs/openapi.yaml
- [ ] Line 4: Update version from 2.2.0 to 2.3.0
- [ ] After line 520: Add POST /forusbot/update-participant endpoint definition
- [ ] Line 294-498: Update POST /forusbot/scrape-plan response schema (add 'notes' array)
- [ ] Line 176-212: Review POST /forusbot/search-participants schema
- [ ] Components section: Add UpdateParticipantRequest schema
- [ ] Components section: Add UpdateParticipantResponse schema

## docs/api/index.html
- [ ] Line 34: Update version badge to v2.3.0
- [ ] After line 251: Add new bot card for "Update Participant Bot"
- [ ] After line 627: Add detailed <details> section for POST /forusbot/update-participant
- [ ] Line 391-440: Update scrape-plan result example (add notes array with sample data)
- [ ] Line 173-221: Review scrape-participant section for accuracy
- [ ] Line 497-578: Update search-participants pagination explanation
- [ ] Footer: Update "Last updated" date

## docs/api/es/index.html
- [ ] Line 35: Update version badge to v2.3.0
- [ ] After line 245: Add new bot card for "Update Participant Bot" (ES translation)
- [ ] After line 809: Add detailed <details> section for POST /forusbot/update-participant (ES)
- [ ] Line 580-630: Update scrape-plan result example (add notes array)
- [ ] Line 363-410: Review scrape-participant section
- [ ] Line 687-770: Update search-participants pagination explanation (ES)
- [ ] Footer: Update "Last updated" date

## docs/index.html
- [ ] Line 5: Update title to include v2.3.0
- [ ] Endpoints grid: Add card for update-participant endpoint
- [ ] Bots section: Add "Update Participant Bot" detailed section
  - [ ] Endpoint description
  - [ ] Headers table (if applicable)
  - [ ] Request body table with all fields
  - [ ] Responses list
  - [ ] cURL example
  - [ ] Link to API reference
- [ ] Update examples section if needed
- [ ] Verify all internal links still work

## docs/es/index.html
- [ ] Line 5: Update title to include v2.3.0
- [ ] Endpoints grid: Add card for update-participant endpoint (ES)
- [ ] Bots section: Add "Update Participant Bot" detailed section (ES translation)
  - [ ] Complete translation matching EN structure
- [ ] Update examples section if needed
- [ ] Verify all internal links still work

## README.md
- [ ] Line 1: Update version from 2.2.0 to 2.3.0
- [ ] Line 16-35: Add POST /forusbot/update-participant to endpoints table
- [ ] Line 55-91: Add cURL example for update-participant endpoint
- [ ] Line 102-109: Update changelog with v2.3.0 changes
  - [ ] List: update-participant bot added
  - [ ] List: scrape-plan now returns notes array
  - [ ] List: any other changes discovered
```

---

### Step 3.3: Prioritize Tasks

**Priority Levels**:

1. **P0 - Critical** (Do First):
   - Version number updates (consistency)
   - Missing endpoint additions
   - Wrong/broken schemas
   - Broken examples that would fail if run

2. **P1 - Important** (Do Second):
   - Incomplete status code documentation
   - Missing parameters
   - Outdated examples (still work but not current)
   - Missing descriptions

3. **P2 - Enhancement** (Do Last):
   - Additional examples
   - Enhanced descriptions
   - Better error documentation
   - Style/formatting improvements

---

## 🛠️ Phase 4: Execution

### Step 4.1: Update OpenAPI Spec FIRST

**Why first?** OpenAPI is the **source of truth**. All other docs should follow it.

**Process**:
1. Open `docs/openapi.yaml`
2. Update version number
3. Add missing endpoints (use existing patterns)
4. Fix schemas (ensure consistency)
5. Add/update examples
6. Validate OpenAPI syntax:
   - Check YAML syntax is valid
   - Verify all `$ref` references resolve
   - Ensure required fields are present
   - Check enum values are used consistently

**Quality Checklist for OpenAPI**:
- [ ] YAML syntax valid (no tabs, proper indentation)
- [ ] Version number updated everywhere it appears
- [ ] All endpoints have `summary` and `description`
- [ ] All parameters have `type`, `required`, and `description`
- [ ] Request bodies have complete schemas
- [ ] All response codes documented (at minimum: 200/202, 400, 401, 500)
- [ ] Examples use realistic data
- [ ] Schemas in `components/schemas` reused via `$ref`
- [ ] Consistent naming conventions

---

### Step 4.2: Update EN API Reference

**File**: `docs/api/index.html`

**Process**:
1. Update version badges in header
2. Add missing endpoint `<details>` sections
3. Update existing sections with corrections
4. Ensure all examples use data from OpenAPI or live tests
5. Verify cURL examples are syntactically correct
6. Test all internal anchor links

**HTML Structure Pattern** (follow this for new endpoints):
```html
<details class="op post" id="endpoint-id">
  <summary>
    <span class="method post">POST</span>
    <span class="path">/forusbot/endpoint-name</span>
    <span class="sum">Short description</span>
  </summary>
  <div class="op-body">
    <p class="muted">Longer description with context.</p>
    
    <h4>Request Body</h4>
    <pre><code class="json">{
  "field": "value"
}</code></pre>
    
    <h4>Responses</h4>
    <div class="resp">
      <div class="code">202 <span class="muted">Accepted</span></div>
      <pre><code class="json">{
  "ok": true,
  "jobId": "uuid"
}</code></pre>
    </div>
    
    <div class="resp">
      <div class="code">400 <span class="muted">Bad Request</span></div>
      <pre><code class="json">{
  "ok": false,
  "error": "message"
}</code></pre>
    </div>
  </div>
</details>
```

**Quality Checklist**:
- [ ] HTML is valid (no unclosed tags)
- [ ] CSS classes match existing patterns
- [ ] JSON examples are formatted (2-space indent)
- [ ] All examples are valid JSON
- [ ] Method badges have correct class (get/post/patch/delete)
- [ ] Internal links use correct anchor IDs

---

### Step 4.3: Update ES API Reference

**File**: `docs/api/es/index.html`

**Process**:
1. **Translate** all content from EN version
2. **Maintain parity**: Same structure, same examples (JSON stays same, descriptions translated)
3. Update version badges
4. Verify language switcher functionality

**Translation Guidelines**:
- Use professional, clear Spanish
- Translate descriptions, notes, table headers
- Keep JSON examples identical (don't translate field names)
- Keep code examples identical
- Translate status messages: "Accepted" → "Aceptado", "Bad Request" → "Solicitud incorrecta"

**Quality Checklist**:
- [ ] All EN content has been translated
- [ ] Structure matches EN version exactly
- [ ] JSON examples identical to EN
- [ ] Code examples identical to EN
- [ ] Natural Spanish (not Google Translate quality)
- [ ] Language switcher links correct

---

### Step 4.4: Update EN Main Docs

**File**: `docs/index.html`

**Process**:
1. Update version references
2. Add missing endpoint cards to grid
3. Add missing bot sections
4. Update schemas if changed
5. Update examples
6. Verify navigation

**Bot Section Template** (follow for new bots):
```html
<section id="bot-name">
  <h3>Bot Display Name</h3>
  <p>Description of what this bot does.</p>
  
  <h4>Endpoint</h4>
  <p><code>POST /forusbot/endpoint-name</code> (auth)</p>
  
  <h4>JSON Body</h4>
  <table class="tbl">
    <thead>
      <tr>
        <th>Field</th>
        <th>Type</th>
        <th>Req</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>fieldName</code></td>
        <td>string</td>
        <td>yes</td>
        <td>Description</td>
      </tr>
    </tbody>
  </table>
  
  <h4>Quick cURL</h4>
  <pre class="code"><code>curl -X POST "$BASE/forusbot/endpoint-name" \
  -H "x-auth-token: &lt;TOKEN&gt;" \
  -H "Content-Type: application/json" \
  -d '{"field":"value"}'</code></pre>
  
  <p><a href="/docs/api#endpoint-id">Read full reference →</a></p>
</section>
```

**Quality Checklist**:
- [ ] Version numbers consistent
- [ ] All bots documented
- [ ] cURL examples tested
- [ ] Links work
- [ ] Tables properly formatted

---

### Step 4.5: Update ES Main Docs

**File**: `docs/es/index.html`

**Process**: Same as Step 4.4 but in Spanish, maintaining parity with EN version.

---

### Step 4.6: Update README

**File**: `README.md`

**Process**:
1. Update version in title (line 1)
2. Add missing endpoints to summary table
3. Update quickstart examples
4. Update changelog
5. Verify all links

**Changelog Format**:
```markdown
## Changelog

- 2.3.0
  - Added `POST /forusbot/update-participant` for updating participant census data
  - Enhanced `POST /forusbot/scrape-plan` to return plan notes history
  - [Other changes discovered during audit]
  - Fixed documentation inconsistencies across all doc files

- 2.2.0
  - [Previous changes]
```

**Quality Checklist**:
- [ ] Version consistent with other docs
- [ ] Table markdown correct (aligned pipes)
- [ ] Links use correct paths
- [ ] Changelog in reverse chronological order
- [ ] Examples are complete and tested

---

## ✅ Phase 5: Verification

### Step 5.1: Cross-File Consistency Check

**Verify these are IDENTICAL across all docs**:

| Element | Check |
|---------|-------|
| Version number | Same in all 6 files |
| Endpoint paths | Exact match (no typos) |
| HTTP methods | Consistent (POST, GET, etc.) |
| Status codes | Same set documented |
| Field names | Exact match (case-sensitive) |
| Required/optional | Same designation |

**Process**: 
- Create a checklist for each endpoint
- Verify each element across all 6 files
- Mark any inconsistencies for fix

---

### Step 5.2: Example Validation

**For every cURL example in docs**:

1. Copy the example
2. Replace placeholders with actual values (if possible)
3. Run the command
4. Verify response matches documented response
5. If mismatch, update documentation

**Document results**:
```
✅ POST /forusbot/vault-file-upload - example works
❌ POST /forusbot/search-participants - returns 400 (fixed typo in example)
⚠️  POST /forusbot/update-participant - can't test (no auth token)
```

---

### Step 5.3: Link Validation

**Check every link in documentation**:

**Internal Links** (anchor links):
- Click or verify each `#anchor` link works
- Common pattern: `<a href="#endpoint-id">Link</a>`
- Ensure target `id="endpoint-id"` exists

**Cross-Doc Links**:
- Links from main docs to API reference
- Links from README to docs
- Language switcher links

**External Links** (if any):
- OpenAPI spec links
- GitHub links (if present)

**Create link audit report**:
```
✅ All internal links in docs/index.html working
❌ Broken: docs/api/index.html line 492 links to #missing-anchor (fixed)
✅ Language switchers work in all files
```

---

### Step 5.4: Schema Validation

**Validate OpenAPI schema**:
1. Use online validator: https://editor.swagger.io/
2. Copy contents of `docs/openapi.yaml`
3. Paste into editor
4. Fix any validation errors
5. Re-save to file

**Or use command-line tool** (if available):
```bash
npx @apidevtools/swagger-cli validate docs/openapi.yaml
```

---

### Step 5.5: Bilingual Parity Check

**For each section in EN docs, verify ES docs have**:
- Same structure
- Same number of sections
- Same examples (JSON identical)
- Translated text (not just copied English)

**Create parity report**:
```
✅ Overview section - full parity
✅ Endpoints section - full parity
❌ Bots section - ES missing update-participant (FIXED)
✅ Examples section - full parity
```

---

### Step 5.6: Final Quality Check

**Complete this checklist**:

- [ ] All endpoints in code are documented
- [ ] All documented endpoints exist in code
- [ ] Version numbers consistent across all 6 files
- [ ] OpenAPI validates with no errors
- [ ] EN and ES docs are synchronized
- [ ] All cURL examples tested (or marked as untestable)
- [ ] All JSON examples are valid JSON
- [ ] All internal links work
- [ ] All tables properly formatted
- [ ] No typos or grammatical errors (use spell check)
- [ ] Changelog updated with all changes
- [ ] README table includes all endpoints
- [ ] All TODO items from plan completed

---

## 📝 Documentation Best Practices

### 1. Writing Style

**Clarity**:
- Use simple, direct language
- Avoid jargon unless necessary (then define it)
- One idea per sentence
- Active voice preferred

**Consistency**:
- Match existing tone and format
- Use same terminology throughout
- Follow established patterns for sections

**Completeness**:
- Every endpoint: description, params, responses, examples, errors
- Every parameter: type, required status, description
- Every status code: when it occurs, what it means

### 2. Code Examples

**cURL Examples**:
```bash
# Good: Clear, complete, with placeholders
curl -X POST "$BASE/forusbot/endpoint" \
  -H "x-auth-token: <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"field":"value"}'

# Bad: Incomplete, unclear
curl -X POST /endpoint -d '{"field":"value"}'
```

**JSON Examples**:
- Use realistic but safe data (no real PII)
- Format with 2-space indentation
- Include optional fields with `null` or commented out
- Show typical success and error cases

### 3. Response Documentation

**For every endpoint, document**:
- Success response(s) with full JSON structure
- All possible error codes with examples
- Conditional fields (e.g., only present when state=running)
- Pagination info (if applicable)
- Headers returned (if any special ones)

### 4. OpenAPI Standards

**Follow OpenAPI 3.0.3 spec**:
- Use `$ref` for reusable components
- Define schemas in `components/schemas` and reference them
- Use `allOf`, `oneOf`, `anyOf` for complex schemas
- Include `examples` (plural) for multiple scenarios
- Use `description` liberally for clarity

### 5. Bilingual Documentation

**EN and ES must have**:
- Same structure (same H2, H3 hierarchy)
- Same examples (code/JSON stay same)
- Same completeness (if EN has 5 examples, ES has 5)
- Natural translation (not machine translation quality)

**What to translate**:
- Headings, descriptions, explanatory text
- Table headers and content
- Status messages ("OK", "Bad Request", etc.)
- Comments in code

**What NOT to translate**:
- JSON field names (`"planId"` stays `"planId"`)
- Code examples (stays in English)
- URLs and endpoints
- HTTP methods (POST, GET, etc.)

---

## 🎨 HTML/CSS Guidelines

### Maintain Existing Structure

**Do**:
- Use existing CSS classes (`.op`, `.get`, `.post`, `.tbl`, `.code`, etc.)
- Follow existing HTML patterns for new sections
- Maintain responsive design (don't break mobile)
- Keep accessibility features (ARIA labels, semantic HTML)

**Don't**:
- Add custom inline styles
- Change the overall layout
- Break existing CSS classes
- Remove accessibility attributes

### Code Block Formatting

```html
<!-- Good: Proper nesting and classes -->
<pre><code class="json">{
  "ok": true,
  "message": "Success"
}</code></pre>

<!-- Bad: Missing classes, improper nesting -->
<pre>{"ok": true}</pre>
```

---

## 🔧 Tools & Commands Reference

### File Reading
```bash
# Read specific files
read_file src/bots/forusall-upload/routes.js
read_file src/routes/index.js
read_file docs/openapi.yaml

# List directories
list_dir src/bots
```

### Searching Codebase
```bash
# Find all route definitions
grep "router\\.post" src/routes/index.js

# Find all bot directories
glob_file_search "**/bots/*/routes.js"

# Search for specific patterns
codebase_search "What are all the registered routes in the application?"
```

### Testing Endpoints
```bash
# If server is running on localhost:10000
run_terminal_cmd curl -sS http://localhost:10000/forusbot/health
run_terminal_cmd curl -sS http://localhost:10000/forusbot/status
```

### File Updates
```bash
# Update specific sections
search_replace file_path old_string new_string

# For large changes, use write (be careful!)
write file_path contents
```

---

## 📊 Progress Tracking

As you work through this task, provide updates in this format:

```markdown
## 🕐 Phase 1: Discovery - IN PROGRESS

✅ Step 1.1: Mapped Bots (6 found: upload, scrape-participant, scrape-plan, search-participants, mfa-reset, update-participant)
✅ Step 1.2: Mapped Routes (28 total routes found)
🔄 Step 1.3: Extracting Implementation Details (currently on: update-participant)
⏳ Step 1.4: Review Configuration (pending)
⏳ Step 1.5: Test Live Endpoints (pending)

### Key Findings So Far:
- 🔍 Discovered undocumented endpoint: POST /forusbot/update-participant
- 🔍 scrape-plan returns 'notes' array not shown in current docs
- 🔍 Version mismatch: README shows 2.2.0, openapi.yaml shows 2.3.0
```

```markdown
## 🕑 Phase 2: Audit - STARTED

✅ Step 2.1: OpenAPI Audit Complete
   - ❌ Missing: /forusbot/update-participant
   - ❌ Incomplete: /forusbot/scrape-plan response (missing notes field)
   - ⚠️  Outdated example: /forusbot/jobs/:id
   - Total issues: 3 critical, 5 important, 8 nice-to-have

🔄 Step 2.2: EN API Reference Audit (in progress: 12 of 28 endpoints reviewed)
⏳ Step 2.3: ES API Reference Audit (pending)
⏳ Step 2.4: EN Main Docs Audit (pending)
⏳ Step 2.5: ES Main Docs Audit (pending)
⏳ Step 2.6: README Audit (pending)
```

```markdown
## 🕒 Phase 3: Planning - COMPLETE

✅ Step 3.1: Consolidated Findings (47 total issues identified)
✅ Step 3.2: Created Detailed Update Plan (67 specific tasks across 6 files)
✅ Step 3.3: Prioritized Tasks
   - P0 Critical: 12 tasks
   - P1 Important: 28 tasks
   - P2 Enhancement: 27 tasks

### Ready to begin Phase 4: Execution
```

```markdown
## 🕓 Phase 4: Execution - IN PROGRESS

✅ Step 4.1: OpenAPI Spec Updated
   - ✅ Version updated to 2.3.0
   - ✅ Added /forusbot/update-participant endpoint
   - ✅ Updated /forusbot/scrape-plan schema
   - ✅ Fixed 8 minor issues
   - ✅ Validated with swagger-cli: PASSED

🔄 Step 4.2: EN API Reference (5 of 12 tasks complete)
   - ✅ Version badge updated
   - ✅ Added update-participant section
   - 🔄 Updating scrape-plan example...
   - ⏳ Remaining: 7 tasks

⏳ Step 4.3: ES API Reference (pending)
⏳ Step 4.4: EN Main Docs (pending)
⏳ Step 4.5: ES Main Docs (pending)
⏳ Step 4.6: README (pending)
```

---

## 🎯 Success Criteria

This task is **COMPLETE** when:

1. ✅ **All endpoints in code are documented** in all 6 files
2. ✅ **No documented endpoints are missing** from code
3. ✅ **Version numbers are consistent** across all files
4. ✅ **OpenAPI spec validates** with zero errors
5. ✅ **EN and ES docs are synchronized** (same structure, translated content)
6. ✅ **All examples are accurate** (tested or marked untestable)
7. ✅ **All JSON is valid** (no syntax errors)
8. ✅ **All internal links work** (no 404s)
9. ✅ **Changelog is updated** with all changes made
10. ✅ **README reflects current state** (version, endpoints, features)
11. ✅ **Verification phase completed** (all checks passed)
12. ✅ **Final quality checklist completed** (all items checked)

---

## 🚀 Begin Execution

**Your task starts NOW.**

1. Start with **Phase 1: Discovery**
2. Work systematically through each phase
3. Document your findings and progress
4. Ask questions if you find significant ambiguities
5. Take your time - quality over speed
6. Use as many tool calls as needed

**Remember**:
- You have unlimited time and resources
- Accuracy is paramount
- Be thorough, methodical, and detail-oriented
- This documentation serves real developers - make it trustworthy

---

## 📞 Need Help?

If you encounter:
- **Conflicting information** in code → Surface it, ask which is correct
- **Ambiguous behavior** → Test it if possible, or document both interpretations
- **Major architectural questions** → Ask before making assumptions
- **Breaking changes** → Highlight them clearly in changelog

---

**Good luck! Begin with Phase 1, Step 1.1: Map All Bots.**
