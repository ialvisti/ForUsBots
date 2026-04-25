# /docs/sandbox/ - Interactive API Testing Environment

## Purpose
This directory contains the interactive sandbox UI for testing ForUsBots API endpoints. It provides a form-based interface for building requests, generating code snippets, and executing real API calls with job polling.

## Architecture
```
docs/sandbox/
├── index.html              # English sandbox UI
├── es/                     # Spanish version
│   ├── index.html
│   └── js/                 # Spanish JS modules
│       ├── core/
│       └── endpoints/
├── js/                     # JavaScript modules
│   ├── core/               # Core UI modules
│   │   ├── email-ui.js     # Email trigger form logic
│   │   ├── meta.js         # Metadata management
│   │   ├── plan-ui.js      # Plan scraping UI
│   │   ├── scrape-ui.js    # Participant scraping UI
│   │   ├── search-ui.js    # Search participants UI
│   │   ├── snippets.js     # Code snippet generation
│   │   ├── theme.js        # Theme switcher
│   │   ├── ui.js           # Main UI logic
│   │   ├── update-ui.js    # Update participant UI
│   │   ├── update-plan-ui.js # Update plan UI (restricted)
│   │   ├── utils.js        # Shared utilities
│   │   └── validate.js     # Input validation
│   └── endpoints/          # Endpoint handlers
│       ├── constants.js    # Endpoint definitions
│       ├── jobs.js         # Job polling logic
│       ├── status.js       # Service status checks
│       └── upload.js       # File upload handling
└── sandbox.css             # Sandbox styles (shared)
```

## Supported Endpoints

### Upload Endpoints
- **vault-upload**: Real file upload (⚠️ CAUTION: Real Request)
- **sandbox-upload**: Dry-run validation (no actual execution)

### Participant Operations
- **update-participant**: Update participant census data
- **scrape-participant**: Extract participant data (modules: census, loans, payroll, etc.)
- **search-participants**: Search for participants by criteria

### Plan Operations
- **scrape-plan**: Extract plan data (modules: basic_info, plan_design, onboarding, etc.)
- **update-plan**: Update fields in the plan edit form (real request) — ⚠️ restricted to `ivan.alvis@forusall.com`
- **sandbox-update-plan**: Dry-run validator for `update-plan` — same restriction as the real endpoint

### Communication Operations
- **email-trigger**: Trigger email communications to participants
  - Supports 10 email types (monthly_balance, onboard_communications, new_hire_communications, year_end_notice, notify_auto-escalation, summary_annual_notice, statement_notice, sponsor_quarterly_email, generic_email, force_out)
  - Conditional fields based on email type
  - Audience targeting for generic emails

### Administrative Operations
- **mfa-reset**: Reset participant MFA enrollment

### Job Management
- **jobs-get**: Retrieve job status by ID
- **jobs-delete**: Cancel a queued job

### Service Status
- **status-get**: Check service health

## Key Features

### 1. Form-Based Request Building
- Dynamic form fields based on selected endpoint
- Conditional field visibility (e.g., statement fields only show for `statement_notice` email type)
- Input validation with helpful error messages
- Auto-generation of request headers and JSON body

### 2. Code Snippet Generation
- **cURL**: Command-line HTTP requests
- **HTTPie**: Human-friendly HTTP CLI
- **Node.js**: JavaScript fetch API
- **Python**: requests library
- Token masking in examples (`****...last4`)

### 3. Live Testing
- Execute real requests against the server
- Job polling for asynchronous operations (202 pattern)
- Real-time job status updates
- Cancel polling functionality

### 4. Dry-Run Mode
- Validate inputs without executing (sandbox-upload only)
- Test request structure before real execution
- No side effects

### 5. Internationalization (i18n)
- Full English and Spanish support
- Language switcher in header
- Localized error messages and help text

## Email Trigger Implementation

### Overview
The **email-trigger** endpoint is a complex form with 10 different email types, each requiring different sets of fields:

### Email Types

#### 1. Monthly Balance
- No additional fields required
- Always uses `participants: "all"`

#### 2. Onboard Communications
**Required:**
- `planSnapshot`: Plan snapshot identifier
- `emailToSend`: Email template to use (default: `onboard_email`)

**Optional:**
- `rkType`: RK type value
- `conversationId`: Conversation ID
- `attachments`: Array of attachment URLs

#### 3. New Hire Communications
**Required:**
- `emailToSend`: Email template to use

**Optional:**
- `rkType`: RK type value
- `planSnapshot`: Plan snapshot identifier
- `conversationId`: Conversation ID
- `attachments`: Array of attachment URLs

#### 4. Year End Notice
- No additional fields required

#### 5. Notify Auto-Escalation
- No additional fields required

#### 6. Summary Annual Notice
- No additional fields required

#### 7. Statement Notice
**Required:**
- `year`: Year (integer)
- `quarter`: Quarter (1-4)
- `season`: Season label (e.g., "Q1")

#### 8. Sponsor Quarterly Email
**Required (all fields):**
- `year`: Year (integer)
- `quarter`: Quarter (1-4)
- `caNoteSubject`: CA note subject line
- `caNoteDetails`: CA note details (textarea)
- `caUrl`: CA URL
- `quarterlyInvestmentReviewUrl`: Review URL
- `nextReviewDate`: Date (YYYY-MM-DD)
- `nextReviewTime`: Time (HH:mm)

#### 9. Generic Email
**Required:**
- `audience`: Checkboxes for enrolled, notEnrolled, terminated, ineligible
- `subType.kind`: One of (onboard_communications, new_hire_communications, year_end_notice, notify_auto-escalation, summary_annual_notice, other)

**Conditional:**
- If `kind === "other"`: `otherText` required
- If `kind === "onboard_communications"`: `rkType` and `emailToSend` optional
- If `kind === "new_hire_communications"`: `emailToSend` required

**Optional:**
- `planSnapshot`: Plan snapshot ID
- `terminatedParticipants`: Comma-separated IDs
- `conversationId`: Conversation ID
- `attachments`: Comma-separated URLs

#### 10. Force Out
- No additional fields required

### UI Implementation

#### File: `js/core/email-ui.js`
**Exports:**
- `wireEmailUI({ onChange })`: Initializes the email trigger form
  - Wires event listeners for all inputs
  - Manages conditional field visibility
  - Calls `onChange` callback on input changes
- `buildEmailBodyStr(pretty)`: Builds JSON body string
  - Validates required fields
  - Constructs request body based on email type
  - Returns compact or pretty-printed JSON

**Key Functions:**
- `updateEmailTypeVisibility()`: Shows/hides conditional field sections
- `updateGenericKindVisibility()`: Shows/hides generic email subtype fields

#### HTML Structure
**Container:** `.ep.ep-email`
**Main Fields:**
- `#emailPlanId`: Plan ID input
- `#emailType`: Email type select dropdown

**Conditional Sections:**
- `#statementFields`: Statement notice fields
- `#sponsorQuarterlyFields`: Sponsor quarterly email fields
- `#onboardNewHireFields`: Onboard/new hire fields
- `#genericEmailFields`: Generic email fields with nested subtype fields

## Update Plan Implementation

### Overview
The **update-plan** endpoint uses a dropdown-based field selector UI with 68 pre-configured plan form fields organized by category. Users select fields from grouped dropdowns instead of typing field names manually.

### Field Categories (68 total)
1. **Basic Info** (8 fields): company_name, official_plan_name, external_name, ein, symlink, logo, rk_plan_id
2. **Status** (4 fields): active, status, effective_date, status_as_of
3. **Plan Design** (19 fields): plan_type, service_type, lt_plan_type, record_keeper_id, enrollment_type, contribution_type, roth_contributions_allowed, profit_sharing, e_statement, spanish_participants, eaca, is_3_16_only, is_critical, roth_match_allowed, fund_lineup_id, rk_upload_mode, enrollment_method
4. **Eligibility** (10 fields): eligibility_min_age, eligibility_hours_requirement, eligibility_duration_value, plan_entry_frequency, plan_entry_frequency_first_month, plan_entry_frequency_second_month, weekly_assumed_hours, force_out_limit, loan_number_cap, max_crypto_percent_balance
5. **Employer Match** (5 fields): employer_contribution, employer_contribution_formula (tiers), employer_contribution_cap, er_contribution_monthly_cap, employer_contribution_timing
6. **Savings & Auto-Escalation** (6 fields): default_savings_rate, max_deferral_rate, autoescalate_rate, autoescalation_limit, autoescalation_source, autoescalation_timing
7. **Key Dates** (8 fields): first_deferral_date, special_participation_date, blackout_begins_date, blackout_ends_date, website_live_date, enrollment_window_begins, enrollment_window_ends, reenrollment_date
8. **Compliance / Features** (4 fields): accept_covid19_amendment, support_aftertax, alts_crypto, alts_waitlist_crypto
9. **Administration** (3 fields): rm_id, im_id, version_id
10. **Audit & Organization** (2 fields): audit_year, organization_type
11. **Marketing & Events** (2 fields): raffle_prize, raffle_date

### Field Types
- **text**: Plain text input (company_name, ein, etc.)
- **date**: HTML date picker (effective_date, enrollment_window_begins, etc.)
- **checkbox**: Select true/false (active, profit_sharing, accept_covid19_amendment, etc.)
- **select**: Dropdown with predefined options (status, plan_type, record_keeper_id, etc.)
- **tiers**: JSON array for employer_contribution_formula (special: `{match_value, percent_pay}` objects)

### UI Implementation

#### File: `js/core/update-plan-ui.js` and `es/js/core/update-plan-ui.js`
**Exports:**
- `wireUpdatePlanUI({ onChange })`: Initializes the update plan form
  - Clears `#uplRows` container
  - Adds first row dynamically
  - Wires "Add field" button to create new rows
  - Listens for changes on static fields (planId, note, includeScreens, timeoutMs)
- `buildUpdatePlanBodyStr(pretty)`: Builds JSON body string
  - Reads planId, note, includeScreens, timeoutMs
  - Iterates all `.upl-row` elements
  - Reads field name from `.upl-label` select value
  - Reads field value from `.upl-input` (type-specific: input, select, or textarea)
  - Returns compact or pretty-printed JSON

**Key Functions:**
- `usedNames(exceptRow)`: Returns Set of field names already selected
- `buildValueInput(spec)`: Creates appropriate widget based on field type
- `renderRowValueUI(row, name)`: Clears and repopulates value input for selected field
- `repopulateLabelSelects()`: Rebuilds all field selects with optgroups, disables used fields
- `addRow({ onChange })`: Creates a new `.module-row.upl-row` with field select + value input

#### HTML Structure
**Container:** `.ep.ep-update-plan`
**Static Fields:**
- `#uplPlanId`: Plan ID input
- `#uplNote`: Update reason textarea
- `#uplIncludeScreens`: Screenshot toggle checkbox
- `#uplTimeoutMs`: Timeout override (5000-120000ms)

**Dynamic Row Section:**
- `#uplRows`: Container for dynamic field rows
- `#uplAddRow`: "Add field" button

**Row Structure (each `.upl-row`):**
```
.module-row.upl-row
  .module-row-controls
    .field
      label "field"
      select.upl-label → field name from FIELD_SPECS
    .module-row-actions
      button "Remove"
  .module-fields
    .upl-value-wrap → .upl-input (text|date|select|textarea)
```

### Key Design Decisions
- **Grouped dropdowns**: Fields organized by category via `<optgroup>` for better UX
- **Duplicate prevention**: `usedNames()` disables already-selected fields in other rows
- **Type-aware inputs**: Field type determines value input widget (text/date/checkbox/select/tiers)
- **Field specs**: `FIELD_SPECS` array contains metadata (name, label, group, type, options)
- **Dynamic repopulation**: All select dropdowns rebuilt when rows added/removed

### Spanish Version
- `es/js/core/update-plan-ui.js`: Identical logic, Spanish labels/strings
- Field names (backend keys) remain unchanged
- Category names translated: "Información Básica", "Diseño del Plan", etc.
- Buttons and placeholders translated

### Fields Not Included (by design)
Of the 137 total form fields in the backend, 68 are available in the UI. The remaining 69 fields are excluded because they are:

**Secondary/Conditional Fields** (fields that appear conditionally based on other field values):
- `er_match_*` fields: Employer match eligibility duplicates
- `profit_sharing_*` fields: Profit sharing eligibility duplicates
- Month-based fields: `*_first_month`, `*_second_month` variants (covered by existing frequency selectors)

**Administrative/Audit Fields** (rarely changed, metadata):
- `audit_start`, `audit_end`: Date ranges (use audit_year instead)
- `nce_status_as_of`, `psa_ext_status_as_of`, `actively_managed_status_as_of`, `pending_termination_status_as_of`, `terminated_status_as_of`: Read-only status snapshots
- `sfdc_id`: Read-only Salesforce ID
- `plan_id`: Passed via URL, not updated via form

**Complex/Array Fields** (require special handling beyond simple value inputs):
- `rk_dates_range[][]`: Nested array structure
- `excluded_employees[]`: Employee array
- `year_end_match_information_choice[]`: Multi-select array
- `employer_contribution_options[qaca]`: Nested checkbox

**Participant-Related Fields** (not about the plan itself):
- `deceased_participants_*`, `military_participants_*`, `retired_participants_*`, `company_officers`, `unreported_compensation`

**Rarely-Modified Specialized Fields**:
- `crypto_portfolio_alert_blacklist`, `payroll_issue`, `payroll_xray`, `simple_upload`: Feature flags
- `collective_bargaining`, `mergers_and_acquisitions_participation`, `significant_ownership_in_other_businesses`, `other_businesses_have_employees`, `other_retirement_plans_any`, `other_retirement_plans_contact`, `outside_assets_any`: Compliance/eligibility flags

**Type-Specific Legacy Fields**:
- `file_type`, `enrollment_method` variants covered by main `enrollment_method`
- `er_contribution_eligibility`: Covered by other employer match fields

To add any of these fields to the UI:
1. Add entry to `FIELD_SPECS` array with appropriate `type` and `options`
2. If field is conditional, add logic to `repopulateLabelSelects()` or consider grouping with related fields
3. For array fields, may need custom `buildValueInput()` logic
4. Update both EN and ES versions with translated labels

## When to Work Here

### Add New Endpoint Support
1. Add endpoint definition to `js/endpoints/constants.js`
2. Add endpoint option to HTML `<select id="endpoint">`
3. Create HTML form fields in `<div class="ep ep-{group} hidden">`
4. Create or update UI module in `js/core/{name}-ui.js`:
   - Export `wire{Name}UI({ onChange })` function
   - Export `build{Name}BodyStr(pretty)` function
5. Import and call wire function in `js/main.js`
6. Add body building logic to `refreshAllOutputs()`
7. Add validation logic to run button handler
8. Add body assignment in run button handler
9. Repeat for Spanish version in `es/` directory
10. Update this FOLDER_CONTEXT.md

### Update Existing Endpoint
1. Modify HTML form fields in `index.html` (and `es/index.html`)
2. Update UI module in `js/core/{name}-ui.js` (and Spanish version)
3. Update validation logic in `js/main.js` (and Spanish version)
4. Test thoroughly in both languages

### Fix Bugs
1. Identify the module responsible (core, endpoints, or main)
2. Make fixes in both English and Spanish versions
3. Test edge cases
4. Update validation if needed

### Add New Features
- **Code snippet formats**: Update `js/core/snippets.js`
- **Validation rules**: Update `js/core/validate.js`
- **Theme customization**: Update `js/core/theme.js` and `sandbox.css`
- **New language**: Create new language directory (e.g., `fr/`)

## Testing Guidelines

### Manual Testing Checklist
- [ ] All endpoints selectable in dropdown
- [ ] Correct fields show/hide for each endpoint
- [ ] Required field validation works
- [ ] Code snippets generate correctly
- [ ] Tokens are masked in snippets
- [ ] Run request executes correctly
- [ ] Job polling works for 202 responses
- [ ] Cancel polling works
- [ ] Dry-run validates correctly (sandbox-upload)
- [ ] Theme switcher works
- [ ] Language switcher works
- [ ] Both EN and ES versions work identically
- [ ] Mobile responsive design works

### Endpoint-Specific Testing

#### Email Trigger
- [ ] All 10 email types selectable
- [ ] Conditional fields show/hide correctly
- [ ] Statement notice: year, quarter, season required
- [ ] Sponsor quarterly: all 8 fields required
- [ ] Onboard: planSnapshot required
- [ ] Generic: subType.kind validation works
- [ ] Generic: otherText required when kind="other"
- [ ] Generic: audience checkboxes work
- [ ] Attachments parse comma-separated correctly
- [ ] Request body structure matches backend expectations

### Browser Testing
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Best Practices

### Code Organization
- Keep UI modules focused (one per endpoint or feature)
- Export clear, reusable functions
- Use descriptive variable names
- Comment complex logic

### HTML Structure
- Use semantic HTML elements
- Group related fields with `<div class="two">` for side-by-side layout
- Use `.hidden` class for conditional visibility
- Add `<div class="help">` for user guidance

### JavaScript Modules
- Use ES6 modules (`import`/`export`)
- Keep functions pure when possible
- Handle null/undefined inputs gracefully
- Use optional chaining (`?.`) for safety

### Internationalization
- Keep technical terms consistent
- Translate all UI text
- Maintain identical HTML structure
- Keep code logic identical (except error messages)

### Validation
- Validate on submission, not on every input
- Provide clear, actionable error messages
- Show field-specific validation hints
- Prevent submission if validation fails

### Accessibility
- Use semantic HTML
- Add ARIA labels where needed
- Ensure keyboard navigation works
- Test with screen readers

## Common Patterns

### Adding a New Conditional Field Section
```javascript
// 1. Add HTML container
<div id="myFields" class="field hidden">
  <h4>My Section</h4>
  <!-- fields here -->
</div>

// 2. Wire visibility logic
function updateVisibility() {
  const show = someCondition();
  $("#myFields")?.classList.toggle("hidden", !show);
  onChange?.();
}

// 3. Wire events
$("#myTrigger")?.addEventListener("change", updateVisibility);
```

### Building Request Body
```javascript
export function buildBodyStr(pretty = false) {
  const field1 = ($("#field1")?.value || "").trim();
  const field2 = parseInt(($("#field2")?.value || "").trim(), 10);
  
  if (!field1 || !field2) return "{}";
  
  const body = { field1, field2 };
  
  // Conditional fields
  if (someCondition()) {
    body.optional = ($("#optional")?.value || "").trim();
  }
  
  return JSON.stringify(body, null, pretty ? 2 : 0);
}
```

## Dependencies

### External Libraries
- **None** (pure vanilla JavaScript)

### Internal Dependencies
- `/docs/sandbox/sandbox.css`: Shared styles
- `/docs/images/icon.png`: Logo
- Browser APIs: `fetch`, `clipboard`, `localStorage`

## Deployment Notes

### Static Serving
- Served by Express via `express.static('docs')`
- No build process required
- Direct file serving

### Cache Control
- Standard browser caching
- No server-side caching

### Security
- No authentication required (safe dry-run by default)
- Token masking in generated snippets
- CORS enabled for cross-origin requests
- Sandbox uses page origin by default

## Future Enhancements
- [ ] Add request history (localStorage)
- [ ] Add favorite requests (localStorage)
- [ ] Add bulk testing (multiple requests)
- [ ] Add GraphQL endpoint support
- [ ] Add WebSocket endpoint testing
- [ ] Add response schema validation
- [ ] Add request/response diff viewer
- [ ] Add automated integration tests

---

**Last Updated:** 2025-01-21
**Maintained By:** Development Team

