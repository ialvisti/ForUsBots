# Documentation Task: `forusall-scrape-plan` Bot

## 🎯 Objective

Completely document the `forusall-scrape-plan` bot across all documentation platforms (API Reference, OpenAPI Specification, and Sandbox UI) in both English and Spanish.

---

## 📚 What This Bot Does

### Bot Overview
**Endpoint**: `POST /forusbot/scrape-plan`

**Purpose**: Scrapes plan data from the ForUsAll employer portal. Extracts structured data from various plan configuration modules including basic information, plan design, onboarding settings, communications, extra settings, and feature flags.

**Similar To**: `forusall-scrape-participant` (same architecture, different entity)

**Authentication**: Requires `x-auth-token` header (user or admin)

**Response Pattern**: 202 Accepted (async job pattern)

---

## 📁 Bot Structure & Code to Understand

### Primary Bot Files (MUST READ THOROUGHLY)
```
/Users/ivanalvis/Desktop/ForUsBots copy/src/bots/forusall-scrape-plan/
├── routes.js              # Express router registration
├── controller.js          # Request validation & job submission
└── runFlow.js            # Automation logic (navigation, extraction)
```

### Extractor Files (MUST READ THOROUGHLY)
```
/Users/ivanalvis/Desktop/ForUsBots copy/src/extractors/forusall-plan/
├── registry.js           # Module registry & field validation
├── utils.js              # Helper functions (tidy, extractPairs, isHidden)
└── modules/
    ├── basic_info.js     # Extracts: plan_id, company_name, ein, status, etc. (16 fields)
    ├── plan_design.js    # Extracts: record_keeper, eligibility, contributions, etc. (26 fields)
    ├── onboarding.js     # Extracts: first_deferral_date, blackout dates, etc. (6 fields)
    ├── communications.js # Extracts: logo, spanish_participants, e_statement, etc. (6 fields)
    ├── extra_settings.js # Extracts: rk_upload_mode, plan_year_start, matching rules, etc. (10 fields)
    └── feature_flags.js  # Extracts: payroll_xray, payroll_issue, simple_upload (3 fields)
```

### Provider Configuration (MUST READ)
```
/Users/ivanalvis/Desktop/ForUsBots copy/src/providers/forusall/planMap.js
# Defines module keys, navigation labels, selectors, and ready states
```

---

## 📖 Documentation Files to Update

### 1. OpenAPI Specification (PRIMARY - UPDATE FIRST)
**File**: `/Users/ivanalvis/Desktop/ForUsBots copy/docs/openapi.yaml`

**Location in File**: Add after `/forusbot/scrape-participant` section (around line 293)

**What to Add**:
- Endpoint definition: `/forusbot/scrape-plan`
- HTTP method: `POST`
- Summary: Brief description
- Parameters: `x-auth-token` header
- Request body schema
- Response schemas (202, 400, 401, 422, 500)
- Complete examples

---

### 2. API Reference Documentation (English)
**File**: `/Users/ivanalvis/Desktop/ForUsBots copy/docs/api/index.html`

**What to Add**:
- New section in the navigation menu
- Complete endpoint documentation with:
  - Endpoint URL and method
  - Description and use cases
  - Request parameters
  - Request body schema
  - Response examples (success and errors)
  - Example curl commands
  - Notes and warnings

---

### 3. API Reference Documentation (Spanish)
**File**: `/Users/ivanalvis/Desktop/ForUsBots copy/docs/api/es/index.html`

**What to Add**:
- Exact same content as English version, translated to Spanish
- Keep technical terms consistent
- Translate descriptions, labels, and examples
- Keep code snippets in English with Spanish comments

---

### 4. Sandbox UI (English)
**Files to Update**:
```
/Users/ivanalvis/Desktop/ForUsBots copy/docs/sandbox/index.html
/Users/ivanalvis/Desktop/ForUsBots copy/docs/sandbox/js/core/scrape-ui.js (or create plan-ui.js)
/Users/ivanalvis/Desktop/ForUsBots copy/docs/sandbox/js/endpoints/constants.js
/Users/ivanalvis/Desktop/ForUsBots copy/docs/sandbox/js/main.js
```

**What to Add**:
- New tab/section for "Scrape Plan"
- Form fields:
  - Plan ID (required, text input)
  - Modules (multi-select with all 6 modules)
  - Fields per module (dynamic multi-select based on module selection)
  - Return Mode (dropdown: data, html, text, both)
  - Include Screens (checkbox)
  - Strict Mode (checkbox)
  - Timeout (number input, default 30000)
- Validation logic
- Code snippet generation (curl, JavaScript fetch)
- Dry-run support (if applicable)

---

### 5. Sandbox UI (Spanish)
**Files to Update**:
```
/Users/ivanalvis/Desktop/ForUsBots copy/docs/sandbox/es/index.html
/Users/ivanalvis/Desktop/ForUsBots copy/docs/sandbox/es/js/core/scrape-ui.js (or plan-ui.js)
/Users/ivanalvis/Desktop/ForUsBots copy/docs/sandbox/es/js/endpoints/constants.js
/Users/ivanalvis/Desktop/ForUsBots copy/docs/sandbox/es/js/main.js
```

**What to Add**:
- Same as English sandbox, fully translated

---

## 📋 Detailed Content Requirements

### Module Definitions (Based on Code Analysis)

#### Module 1: `basic_info`
**Description**: Top-level plan information (always visible, no tab navigation)

**Fields** (16 total):
```javascript
[
  "plan_id",              // Hidden field: plan ID
  "version_id",           // Hidden field: version effective date
  "symlink",              // Short Name
  "sfdc_id",              // Salesforce ID
  "company_name",         // Company Name
  "official_plan_name",   // Official Plan Name
  "rm_id",                // Relationship Manager
  "im_id",                // Implementation Manager
  "service_type",         // Service Type
  "plan_type",            // Plan Type
  "active",               // Active (True/False)
  "status",               // Status
  "status_as_of",         // Status As Of Date
  "is_3_16_only",         // 3(16) Only
  "ein",                  // EIN
  "effective_date"        // Effective Date
]
```

#### Module 2: `plan_design`
**Description**: Plan design settings (tab navigation required)

**Fields** (26 total):
```javascript
[
  "record_keeper_id",                      // Record Keeper
  "rk_plan_id",                            // RK Plan ID
  "external_name",                         // External Name
  "lt_plan_type",                          // LT Plan Type
  "accept_covid19_amendment",              // Accept COVID-19 Amendment
  "fund_lineup_id",                        // Fund Lineup
  "enrollment_type",                       // Enrollment Type
  "eligibility_min_age",                   // Eligibility Min Age
  "eligibility_duration_value",            // Eligibility Duration Value
  "eligibility_duration_unit",             // Eligibility Duration Unit
  "eligibility_hours_requirement",         // Eligibility Hours
  "plan_entry_frequency",                  // Plan Entry Frequency
  "plan_entry_frequency_first_month",      // Plan Entry First Month
  "plan_entry_frequency_second_month",     // Plan Entry Second Month
  "employer_contribution",                 // Employer Contribution Type
  "er_contribution_monthly_cap",           // ER Contribution Monthly Cap
  "employer_contribution_cap",             // Employer Contribution Cap
  "employer_contribution_timing",          // ER Contribution Timing
  "employer_contribution_options_qaca",    // QACA
  "default_savings_rate",                  // Default Savings Rate
  "contribution_type",                     // Contribution Type
  "autoescalate_rate",                     // Auto Escalate Rate
  "support_aftertax",                      // Support After-Tax
  "alts_crypto",                           // Crypto Enabled
  "alts_waitlist_crypto",                  // Crypto Waitlist
  "max_crypto_percent_balance"             // Max Crypto Percent Balance
]
```

#### Module 3: `onboarding`
**Description**: Onboarding dates and conversion settings (tab navigation required)

**Fields** (6 total):
```javascript
[
  "first_deferral_date",        // First Deferral Date
  "special_participation_date",  // Special Participation Date
  "enrollment_method",           // Enrollment Method
  "blackout_begins_date",        // Blackout Begins Date
  "blackout_ends_date",          // Blackout Ends Date
  "website_live_date"            // Website Live Date
]
```

#### Module 4: `communications`
**Description**: Communication preferences and branding (tab navigation required)

**Fields** (6 total):
```javascript
[
  "dave_text",              // DAVE Text (HTML)
  "logo",                   // Logo ID
  "spanish_participants",   // Spanish Participants
  "e_statement",            // E-Statement
  "raffle_prize",           // Raffle Prize
  "raffle_date"             // Raffle Date
]
```

#### Module 5: `extra_settings`
**Description**: Advanced eligibility and matching rules (tab navigation required)

**Fields** (10 total):
```javascript
[
  "rk_upload_mode",                            // RK Upload Mode
  "plan_year_start",                           // Plan Year Start
  "er_contribution_eligibility",               // ER Contribution Eligibility
  "er_match_eligibility_age",                  // ER Match Eligibility Age
  "er_match_eligibility_duration_value",       // ER Match Eligibility Duration Value
  "er_match_eligibility_duration_unit",        // ER Match Eligibility Duration Unit
  "er_match_eligibility_hours_requirement",    // ER Match Eligibility Hours
  "er_match_plan_entry_frequency",             // ER Match Plan Entry Frequency
  "er_match_plan_entry_frequency_first_month", // ER Match Plan Entry First Month
  "er_match_plan_entry_frequency_second_month" // ER Match Plan Entry Second Month
]
```

#### Module 6: `feature_flags`
**Description**: Feature toggles and flags (tab navigation required)

**Fields** (3 total):
```javascript
[
  "payroll_xray",    // Payroll X-Ray (true/false)
  "payroll_issue",   // Payroll Issue (true/false)
  "simple_upload"    // Simple Upload (true/false)
]
```

#### Special: `notes`
**Description**: Plan notes history (always extracted, not a module)

**Format**: Array of strings, each string is a note entry

**Example**:
```json
{
  "notes": [
    "Updating status and termination date based on the timeline provided...",
    "plan moved to principal",
    "Updated to calendar year"
  ]
}
```

---

## 📝 Request Schema (OpenAPI)

### Request Body
```yaml
requestBody:
  required: true
  content:
    application/json:
      schema:
        type: object
        required: [planId]
        properties:
          planId:
            type: string
            description: Plan ID to scrape
            example: "627"
          
          modules:
            type: array
            description: Modules to extract (empty = all modules)
            items:
              oneOf:
                - type: string
                  example: "basic_info"
                - type: object
                  properties:
                    key:
                      type: string
                      example: "plan_design"
                    fields:
                      type: array
                      items:
                        type: string
                      example: ["record_keeper_id", "rk_plan_id"]
            example: ["basic_info", {"key": "plan_design", "fields": ["record_keeper_id"]}]
          
          return:
            type: string
            enum: [data, html, text, both]
            default: data
            description: Return mode (data=structured, html=raw HTML, text=plain text, both=data+html+text)
          
          strict:
            type: boolean
            default: false
            description: If true, fail job if any module fails
          
          includeScreens:
            type: boolean
            default: false
            description: Include screenshots in result
          
          timeoutMs:
            type: integer
            minimum: 5000
            default: 30000
            description: Job timeout in milliseconds
```

---

## 📤 Response Schemas (OpenAPI)

### 202 Accepted (Success)
```yaml
responses:
  '202':
    description: Job accepted and queued
    content:
      application/json:
        schema:
          type: object
          required: [ok, jobId, botId, meta, state, acceptedAt]
          properties:
            ok:
              type: boolean
              example: true
            jobId:
              type: string
              format: uuid
              example: "f628e7c7-11b8-4419-9c30-29c572a99d81"
            botId:
              type: string
              example: "scrape-plan"
            meta:
              type: object
              description: Job metadata
            state:
              type: string
              enum: [queued, running, succeeded, failed, canceled]
              example: "queued"
            acceptedAt:
              type: string
              format: date-time
              example: "2025-11-13T07:09:24.211Z"
            estimate:
              type: object
              properties:
                startAt:
                  type: string
                  format: date-time
                finishAt:
                  type: string
                  format: date-time
            warnings:
              type: array
              items:
                type: string
```

### 400 Bad Request
```yaml
'400':
  description: Invalid request format
  content:
    application/json:
      schema:
        type: object
        properties:
          ok:
            type: boolean
            example: false
          error:
            type: string
            example: "invalid_request"
          message:
            type: string
            example: "Request body must be valid JSON"
```

### 401 Unauthorized
```yaml
'401':
  description: Missing or invalid authentication token
  content:
    application/json:
      schema:
        type: object
        properties:
          ok:
            type: boolean
            example: false
          error:
            type: string
            example: "unauthorized"
```

### 422 Unprocessable Entity
```yaml
'422':
  description: Validation failed
  content:
    application/json:
      schema:
        type: object
        properties:
          ok:
            type: boolean
            example: false
          error:
            type: string
            example: "validation_failed"
          message:
            type: string
            example: "planId is required"
          details:
            type: object
          invalidModules:
            type: array
            items:
              type: string
```

### 500 Internal Server Error
```yaml
'500':
  description: Internal server error
  content:
    application/json:
      schema:
        type: object
        properties:
          ok:
            type: boolean
            example: false
          error:
            type: string
            example: "internal_error"
```

---

## 🧪 Job Result Schema (Successful Extraction)

When polling `GET /forusbot/jobs/{jobId}` after job succeeds:

```json
{
  "ok": true,
  "jobId": "f628e7c7-11b8-4419-9c30-29c572a99d81",
  "botId": "scrape-plan",
  "state": "succeeded",
  "acceptedAt": "2025-11-13T07:09:24.211Z",
  "startedAt": "2025-11-13T07:09:24.226Z",
  "finishedAt": "2025-11-13T07:09:43.857Z",
  "result": {
    "ok": true,
    "code": "OK",
    "message": null,
    "data": {
      "url": "https://employer.forusall.com/plans/627/edit",
      "planId": "627",
      "modulesRequested": [...],
      "modules": [
        {
          "key": "basic_info",
          "status": "ok",
          "source": "panel",
          "requestedFields": null,
          "data": {
            "plan_id": "627",
            "company_name": "Revolution Foods, Inc.",
            "ein": "141955846",
            ...
          },
          "extractorWarnings": [],
          "evidencePath": null
        },
        ...
      ],
      "notes": [
        "Updating status and termination date...",
        "plan moved to principal",
        ...
      ],
      "full": null
    },
    "warnings": [],
    "errors": []
  },
  "error": null,
  "stages": [...],
  "totalSeconds": 19
}
```

---

## 📚 Example Use Cases (For Documentation)

### Example 1: Extract All Data
**Description**: Extract all modules and notes for a plan

**Request**:
```bash
curl -X POST http://localhost:10000/forusbot/scrape-plan \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "627",
    "modules": [
      "basic_info",
      "plan_design",
      "onboarding",
      "communications",
      "extra_settings",
      "feature_flags"
    ]
  }'
```

**Use Case**: Complete plan audit or data migration

---

### Example 2: Extract Specific Module
**Description**: Extract only basic plan information

**Request**:
```bash
curl -X POST http://localhost:10000/forusbot/scrape-plan \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "627",
    "modules": ["basic_info"]
  }'
```

**Use Case**: Quick status check or company name lookup

---

### Example 3: Extract Specific Fields
**Description**: Extract only certain fields from a module

**Request**:
```bash
curl -X POST http://localhost:10000/forusbot/scrape-plan \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "627",
    "modules": [
      {
        "key": "basic_info",
        "fields": ["plan_id", "company_name", "ein", "status"]
      }
    ]
  }'
```

**Use Case**: Minimizing response size for specific data points

---

### Example 4: Extract with Screenshots
**Description**: Extract data with evidence screenshots

**Request**:
```bash
curl -X POST http://localhost:10000/forusbot/scrape-plan \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "627",
    "modules": ["basic_info", "plan_design"],
    "includeScreens": true
  }'
```

**Use Case**: Debugging or compliance audit trail

---

### Example 5: Strict Mode
**Description**: Fail entire job if any module fails

**Request**:
```bash
curl -X POST http://localhost:10000/forusbot/scrape-plan \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "627",
    "modules": ["basic_info", "plan_design", "onboarding"],
    "strict": true
  }'
```

**Use Case**: Ensuring data completeness for critical operations

---

## 🌐 Translation Guidelines (Spanish)

### Key Terms (English → Spanish)
- **Scrape Plan** → **Extraer Plan**
- **Plan ID** → **ID del Plan**
- **Modules** → **Módulos**
- **Fields** → **Campos**
- **Return Mode** → **Modo de Retorno**
- **Include Screens** → **Incluir Capturas**
- **Strict Mode** → **Modo Estricto**
- **Timeout** → **Tiempo de Espera**
- **Basic Info** → **Información Básica**
- **Plan Design** → **Diseño del Plan**
- **Onboarding** → **Incorporación**
- **Communications** → **Comunicaciones**
- **Extra Settings** → **Configuraciones Adicionales**
- **Feature Flags** → **Indicadores de Características**
- **Notes** → **Notas**
- **Job accepted** → **Trabajo aceptado**
- **Extract all data** → **Extraer todos los datos**
- **Specific module** → **Módulo específico**
- **Specific fields** → **Campos específicos**

### Translation Notes
- Keep field names in English (e.g., "plan_id", "company_name") as they're technical identifiers
- Translate descriptions and labels
- Keep code examples in English with Spanish comments
- Maintain consistency with existing Spanish documentation

---

## ✅ Quality Checklist

Before considering the documentation complete, verify:

### OpenAPI Specification
- [ ] Endpoint added with correct path and method
- [ ] All parameters documented (header, body)
- [ ] Request schema complete with all properties
- [ ] All response codes documented (202, 400, 401, 422, 500)
- [ ] Response schemas accurate and complete
- [ ] Examples provided and tested
- [ ] No YAML syntax errors (`npm run lint` or YAML validator)

### API Reference (English)
- [ ] New section added to navigation
- [ ] Endpoint URL and method clearly stated
- [ ] Description explains what the bot does
- [ ] Request parameters documented
- [ ] Request body schema with all properties
- [ ] Response examples (success and errors)
- [ ] curl examples tested and working
- [ ] Links to related endpoints
- [ ] Notes/warnings included where appropriate

### API Reference (Spanish)
- [ ] Exact same structure as English version
- [ ] All text translated (except code/field names)
- [ ] Technical terms consistent
- [ ] curl examples with Spanish comments
- [ ] No broken links

### Sandbox UI (English)
- [ ] New tab/section for "Scrape Plan"
- [ ] Form with all required fields
- [ ] Module selection with all 6 modules
- [ ] Field selection per module (dynamic)
- [ ] Validation working (required fields, format)
- [ ] Code snippet generation working (curl, fetch)
- [ ] Test with actual API confirms functionality
- [ ] Errors displayed properly
- [ ] Dry-run mode (if applicable)

### Sandbox UI (Spanish)
- [ ] Same functionality as English
- [ ] All labels translated
- [ ] Error messages translated
- [ ] Code snippets with Spanish comments
- [ ] Form validation messages in Spanish

### Cross-Cutting
- [ ] Consistent terminology across all docs
- [ ] No broken links between sections
- [ ] Examples tested against live API
- [ ] Token masking in examples
- [ ] Module field lists match code exactly
- [ ] Response schemas match actual API output

---

## 🚨 Critical Constraints

### DO NOT:
1. ❌ Modify any bot code (`/src/bots/`, `/src/extractors/`, `/src/providers/`)
2. ❌ Change API behavior or contracts
3. ❌ Add new dependencies
4. ❌ Modify existing endpoint documentation (only add new)
5. ❌ Break existing sandbox functionality
6. ❌ Introduce syntax errors (HTML, YAML, JavaScript)
7. ❌ Use fake/placeholder data (use real examples from Plan 627)
8. ❌ Skip Spanish translation (both languages required)

### DO:
1. ✅ Read all bot code thoroughly before writing docs
2. ✅ Extract field lists directly from extractor modules
3. ✅ Test all curl examples against live API
4. ✅ Use consistent formatting with existing docs
5. ✅ Follow existing patterns (scrape-participant as template)
6. ✅ Validate YAML syntax after editing openapi.yaml
7. ✅ Test sandbox forms manually
8. ✅ Mask tokens in examples (`****...last4`)
9. ✅ Include both success and error examples
10. ✅ Link related endpoints (jobs API for polling)

---

## 🛠️ Development Workflow

### Step 1: Read and Understand (CRITICAL)
1. **Read PROJECT_STRUCTURE.md** (mandatory workspace rule)
2. **Read FOLDER_CONTEXT.md** for `/docs/`
3. **Read all bot code**:
   - `/src/bots/forusall-scrape-plan/runFlow.js` (entire file)
   - `/src/bots/forusall-scrape-plan/controller.js` (entire file)
   - `/src/extractors/forusall-plan/registry.js` (entire file)
   - All extractor modules (basic_info.js, plan_design.js, etc.)
   - `/src/providers/forusall/planMap.js` (entire file)
4. **Identify**:
   - Exact module keys
   - Field lists per module (from SUPPORTED_FIELDS)
   - Request validation rules
   - Response structure
   - Error cases

### Step 2: Study Reference Implementation
1. **Read existing docs for `/forusbot/scrape-participant`**:
   - OpenAPI spec entry
   - API reference (English and Spanish)
   - Sandbox UI implementation
2. **Note patterns**:
   - Section structure
   - Example formats
   - Code snippet styles
   - Translation approach

### Step 3: Update OpenAPI Spec (FIRST)
1. **Open** `/Users/ivanalvis/Desktop/ForUsBots copy/docs/openapi.yaml`
2. **Find** `/forusbot/scrape-participant` section (around line 256)
3. **Add** `/forusbot/scrape-plan` section immediately after
4. **Copy** structure from scrape-participant
5. **Modify** for plan-specific details:
   - Change `participantId` to `planId`
   - Update module keys (6 modules for plan vs 9 for participant)
   - Update field examples
6. **Validate** YAML syntax (no tabs, correct indentation)
7. **Test** by fetching `GET /forusbot/openapi` (admin only)

### Step 4: Update API Reference (English)
1. **Open** `/Users/ivanalvis/Desktop/ForUsBots copy/docs/api/index.html`
2. **Find** scrape-participant section in navigation
3. **Add** new navigation item for scrape-plan
4. **Create** new section with:
   - Heading and description
   - Request parameters table
   - Request body schema
   - Response examples (202, 400, 401, 422, 500)
   - curl examples (all 5 use cases)
   - Notes section
5. **Link** to jobs API for polling
6. **Test** by opening in browser

### Step 5: Update API Reference (Spanish)
1. **Open** `/Users/ivanalvis/Desktop/ForUsBots copy/docs/api/es/index.html`
2. **Copy** English section structure
3. **Translate** all text (except code/field names)
4. **Use** translation guidelines above
5. **Test** by opening in browser

### Step 6: Update Sandbox (English)
1. **Create plan-specific constants**:
   - Edit `/Users/ivanalvis/Desktop/ForUsBots copy/docs/sandbox/js/endpoints/constants.js`
   - Add `PLAN_MODULES` array with all 6 modules and their fields
   
2. **Create plan UI builder** (option A: extend scrape-ui.js, option B: create plan-ui.js):
   - Form builder function
   - Module selection with checkboxes
   - Field selection (dynamic based on module)
   - Validation logic
   - JSON body builder
   
3. **Update main.js**:
   - Add "Scrape Plan" tab
   - Register event handlers
   - Connect to plan UI builder
   
4. **Update index.html**:
   - Add tab button
   - Add container div
   
5. **Test**:
   - Form renders correctly
   - Module selection works
   - Field selection updates dynamically
   - Validation catches errors
   - Code snippets generate correctly
   - Submit calls correct endpoint

### Step 7: Update Sandbox (Spanish)
1. **Repeat Step 6** for Spanish files:
   - `/Users/ivanalvis/Desktop/ForUsBots copy/docs/sandbox/es/index.html`
   - `/Users/ivanalvis/Desktop/ForUsBots copy/docs/sandbox/es/js/main.js`
   - `/Users/ivanalvis/Desktop/ForUsBots copy/docs/sandbox/es/js/endpoints/constants.js`
   - `/Users/ivanalvis/Desktop/ForUsBots copy/docs/sandbox/es/js/core/scrape-ui.js` (or plan-ui.js)
2. **Translate** all UI labels and messages
3. **Test** fully in Spanish

### Step 8: Testing & Verification
1. **OpenAPI Spec**:
   ```bash
   curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     http://localhost:10000/forusbot/openapi | grep -A 50 "scrape-plan"
   ```

2. **API Reference**:
   - Open English version: http://localhost:10000/docs/api/
   - Open Spanish version: http://localhost:10000/docs/api/es/
   - Verify navigation links work
   - Verify all sections render correctly

3. **Sandbox**:
   - Open English version: http://localhost:10000/docs/sandbox/
   - Open Spanish version: http://localhost:10000/docs/sandbox/es/
   - Test form submission with Plan ID "627"
   - Verify code snippets match actual API
   - Test each use case example

4. **Live API Test**:
   ```bash
   # Test from documentation example
   curl -X POST http://localhost:10000/forusbot/scrape-plan \
     -H "Authorization: Bearer 1" \
     -H "Content-Type: application/json" \
     -d '{"planId": "627", "modules": ["basic_info"]}'
   ```

### Step 9: Final Review
1. **Run linter** (if available): `npm run lint`
2. **Check for**:
   - Broken links
   - Typos
   - Missing translations
   - Inconsistent terminology
   - Syntax errors
3. **Verify**:
   - All 6 modules documented
   - All field counts match code
   - Examples use real data
   - Tokens masked in docs

---

## 📊 Module Field Summary (Quick Reference)

| Module | Key | Fields | Tab Required |
|--------|-----|--------|--------------|
| Basic Info | `basic_info` | 16 | No (top-level) |
| Plan Design | `plan_design` | 26 | Yes |
| Onboarding | `onboarding` | 6 | Yes |
| Communications | `communications` | 6 | Yes |
| Extra Settings | `extra_settings` | 10 | Yes |
| Feature Flags | `feature_flags` | 3 | Yes |
| **TOTAL** | | **67** | |
| Notes | (special) | Variable (array) | No (always extracted) |

---

## 📖 Code Snippet Templates

### Curl - Extract All Modules
```bash
curl -X POST http://localhost:10000/forusbot/scrape-plan \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "627",
    "modules": [
      "basic_info",
      "plan_design",
      "onboarding",
      "communications",
      "extra_settings",
      "feature_flags"
    ]
  }'
```

### JavaScript Fetch - Extract Specific Fields
```javascript
const response = await fetch('http://localhost:10000/forusbot/scrape-plan', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    planId: '627',
    modules: [
      {
        key: 'basic_info',
        fields: ['plan_id', 'company_name', 'ein']
      }
    ]
  })
});

const result = await response.json();
console.log('Job ID:', result.jobId);

// Poll for result
const pollJobStatus = async (jobId) => {
  const jobResponse = await fetch(
    `http://localhost:10000/forusbot/jobs/${jobId}`,
    {
      headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
    }
  );
  return await jobResponse.json();
};

// Wait and check
setTimeout(async () => {
  const job = await pollJobStatus(result.jobId);
  if (job.state === 'succeeded') {
    console.log('Extracted data:', job.result.data);
  }
}, 5000);
```

---

## 🎓 Resources

### Existing Documentation Examples
- **Scrape Participant**: `/docs/api/index.html` (search for "scrape-participant")
- **Upload Bot**: `/docs/api/index.html` (search for "vault-file-upload")
- **OpenAPI Spec**: `/docs/openapi.yaml` (lines 256-292 for scrape-participant)
- **Sandbox**: `/docs/sandbox/js/core/scrape-ui.js` (participant UI builder)

### Workspace Documentation
- **PROJECT_STRUCTURE.md**: Overview of entire project
- **docs/FOLDER_CONTEXT.md**: Documentation folder guide
- **Always Applied Rules**: See workspace rules for coding standards

---

## 🚀 Success Criteria

### Documentation is Complete When:
1. ✅ OpenAPI spec includes complete `/forusbot/scrape-plan` definition
2. ✅ API reference (EN) has comprehensive scrape-plan section
3. ✅ API reference (ES) has translated scrape-plan section
4. ✅ Sandbox (EN) has functional scrape-plan form
5. ✅ Sandbox (ES) has translated and functional scrape-plan form
6. ✅ All 6 modules documented with correct field counts
7. ✅ Notes extraction documented
8. ✅ At least 5 use case examples provided
9. ✅ All curl examples tested against live API
10. ✅ No syntax errors (HTML, YAML, JavaScript)
11. ✅ Consistent terminology across all docs
12. ✅ Tokens masked in examples
13. ✅ Links between sections work
14. ✅ Manual testing confirms accuracy

---

## 📞 Questions & Troubleshooting

### If Field Counts Don't Match
- Re-read extractor module files
- Check `SUPPORTED_FIELDS` array in each module
- Verify against actual API response from Plan 627

### If OpenAPI Validation Fails
- Check YAML indentation (use spaces, not tabs)
- Verify all required properties present
- Compare with scrape-participant structure
- Use online YAML validator

### If Sandbox Form Doesn't Work
- Check browser console for JavaScript errors
- Verify event handlers registered
- Confirm endpoint constants match
- Test with simpler form first (only Plan ID)

### If Translation Unclear
- Keep technical terms in English
- Use Google Translate for initial draft
- Compare with existing Spanish docs for consistency
- Focus on clarity over literal translation

---

## 🎯 Final Deliverable

Upon completion, provide:

1. **Summary of Changes**:
   - List of all files modified
   - Line counts added per file
   - Key decisions made

2. **Testing Evidence**:
   - Screenshots of API reference (EN & ES)
   - Screenshots of sandbox (EN & ES)
   - curl command outputs showing success

3. **Field Verification**:
   - Confirm all 67 fields documented
   - Confirm 6 modules documented
   - Confirm notes extraction documented

4. **Links**:
   - Direct links to updated sections
   - Example: `http://localhost:10000/docs/api/#scrape-plan`

---

**Goal**: Complete, accurate, bilingual documentation for the `forusall-scrape-plan` bot that enables developers to understand and use the endpoint effectively.

Good luck! 📚🚀

