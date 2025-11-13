# /src/providers/ - Provider Configuration Context

## Purpose
This directory contains provider-specific configuration (URLs, selectors, defaults) for external systems. Currently supports ForUsAll employer portal. This centralized configuration ensures consistency across all bots.

## Architecture
```
providers/
└── forusall/
    ├── config.js          # URLs, selectors, timeouts, defaults
    ├── participantMap.js  # Participant page module specifications
    └── planMap.js         # Plan page module specifications
```

## Key Files

### `forusall/config.js`
**Purpose**: Central configuration for all ForUsAll portal automation. Contains hardcoded URLs, CSS selectors, and operational defaults.

**Exports**: `module.exports.FIXED`

**Contents**:

#### URLs
- **`loginUrl`**: Login page URL
- **`uploadUrlTemplate`**: Vault file upload URL (with `{planIdNumber}` placeholder)
- **`participantUrlTemplate`**: Participant profile URL (with `{participantId}` placeholder)
- **`participantSearch.url`**: Search participants page URL
- **`triggerEmails.url`**: Email trigger page URL

#### Selectors

##### Authentication
- **`user`**: Username input (#user_email)
- **`pass`**: Password input (#user_password)
- **`loginButton`**: Login submit button
- **`otpInput`**: OTP input field (#otp_attempt)
- **`otpSubmit`**: OTP submit button
- **`otpInputsAlt`**: Alternative OTP selectors (array)
- **`otpSubmitAlt`**: Alternative OTP submit selectors (array)

##### Upload Form
- **`fileInput`**: File upload input
- **`fileSubmit`**: Submit button
- **`form.section`**: Section dropdown
- **`form.caption`**: Caption dropdown
- **`form.status`**: Status dropdown
- **`form.effectiveDate`**: Effective date input
- **`form.customCaption`**: Custom caption text input (for "Other")
- **`form.container`**: Form container selector

##### MFA Reset
- **`mfaReset.panel`**: MFA tab panel
- **`mfaReset.panelDetails`**: MFA details section
- **`mfaReset.status`**: Status text element
- **`mfaReset.resetButton`**: Reset MFA button
- **`mfaReset.refreshLink`**: Refresh link
- **`mfaReset.navLink`**: MFA tab link

##### Participant Search
- **`participantSearch.selectors.shell`**: Search page container
- **`participantSearch.selectors.inputs.*`**: Search form inputs (planName, fullName, ssn, phone, email, participantId)
- **`participantSearch.selectors.searchBtn`**: Search button
- **`participantSearch.selectors.table`**: Results table
- **`participantSearch.selectors.emptyCell`**: Empty results cell
- **`participantSearch.selectors.processing`**: Loading indicator
- **`participantSearch.selectors.info`**: Results info text
- **`participantSearch.selectors.nextBtn`**: Pagination next button

##### Email Trigger
- **`triggerEmails.selectors.form`**: Email trigger form
- **`triggerEmails.selectors.planSelect`**: Plan dropdown
- **`triggerEmails.selectors.emailTypeSelect`**: Email type dropdown
- **`triggerEmails.selectors.participantSelect`**: Participant dropdown
- **`triggerEmails.selectors.previewButton`**: Preview button
- Plus many flow-specific selectors (rkType, statementYear, sponsorQuarter, etc.)

#### Options/Defaults
- **`options.returnEvidenceBase64`**: Default false
- **`options.saveEvidenceToTmp`**: Default true
- **`options.clearWaitMs`**: Form clear verification wait time (3000ms)
- **`options.clearPollMs`**: Form clear polling interval (150ms)
- **`options.evidenceOnSuccess`**: Save evidence on success (false)

#### MFA Reset Config
- **`mfaReset.successMessage`**: Expected success message text
- **`mfaReset.timeouts.*`**: Operation timeouts (pageLoad, buttonWait, confirmWait, alertWait, statusSettle)

**When to use**: Any time you need URLs or selectors for ForUsAll portal automation.

---

### `forusall/participantMap.js`
**Purpose**: Defines specifications for each participant page module (census, savings rate, loans, payroll, plan details, MFA). Used by scrape-participant bot to navigate and extract data.

**Exports**: `getSpec(moduleKey)` function

**Module Specification Structure**:
```javascript
{
  key: 'census',                 // Unique module identifier
  navLabel: 'Census',            // Navigation link text
  synonyms: ['Personal Info'],   // Alternative labels
  navSelector: '#census-link',   // Direct CSS selector (optional)
  panelSelector: '#census',      // Panel container selector
  forceNav: false,               // Always navigate even if panel visible
  ready: {                       // Ready state check
    selector: '.census-loaded',
    textRegex: /Census Data/i
  }
}
```

**Available Modules**:
- **census**: Participant demographic and employment data
- **savings_rate**: Contribution percentages and escalation
- **loans**: Active and historical loans
- **plan_details**: Plan enrollment and vesting
- **payroll**: Payroll contribution history
- **mfa**: MFA enrollment status

**When to use**: When scraping participant pages, navigating to specific modules, or validating module keys.

---

### `forusall/planMap.js`
**Purpose**: Defines specifications for each plan page module (basic_info, plan_design, onboarding, communications, extra_settings, feature_flags). Used by scrape-plan bot to navigate and extract data.

**Exports**: `getSpec(moduleKey)` function

**Module Specification Structure**:
```javascript
{
  key: 'basic_info',                // Unique module identifier
  navLabel: null,                    // Navigation link text (null if always visible)
  synonyms: [],                      // Alternative labels
  navSelector: null,                 // Direct CSS selector (optional)
  panelSelector: '#bitemporal-plan-attrs', // Panel container selector
  ready: { selector: '#plan_id' },  // Ready state check
  description: 'Basic plan information (company name, EIN, status, dates)'
}
```

**Available Modules**:
- **basic_info**: Core plan identification (always visible, no navigation)
- **plan_design**: Eligibility, contributions, enrollment settings
- **onboarding**: Onboarding dates and conversion settings
- **communications**: Branding, messaging, contact preferences
- **extra_settings**: Advanced eligibility and matching rules
- **feature_flags**: Feature toggles and flags

**Exports Function**: `allowedKeys()` returns array of valid module keys.

**When to use**: When scraping plan pages, navigating to plan modules, or validating plan module keys.

---

## When to Work Here

### Modify Selectors When:
- ForUsAll portal HTML structure changes
- New UI elements are added to portal
- Selectors become ambiguous (need more specificity)
- Portal introduces new pages/forms

### Add New Configuration When:
- Supporting a new ForUsAll portal feature
- Adding a new automation flow
- Need provider-specific defaults
- Adding new participant page modules

### DO NOT Modify When:
- Implementing bot logic (use `/src/bots/`)
- Adding utilities (use `/src/engine/utils/`)
- Creating extractors (use `/src/extractors/`)
- Changing auth flow (use `/src/engine/auth/`)

---

## Selector Best Practices

### Selector Priority (Most to Least Stable)
1. **ID selectors** (`#user_email`) - Most stable
2. **Data attributes** (`[data-testid="login"]`) - If available
3. **Semantic roles** (use Playwright's getByRole) - Good for accessibility
4. **Name attributes** (`input[name="otp_attempt"]`) - Moderately stable
5. **Class selectors** (`.login-button`) - Less stable
6. **nth-child selectors** (`div:nth-child(7)`) - Fragile, avoid if possible

### Selector Maintenance
- **Document**: Add comments explaining what element selector targets
- **Alternatives**: Provide fallback selectors in `*Alt` arrays
- **Test regularly**: Verify selectors still work after portal updates
- **Version control**: Track when selectors were last updated

### Handling Portal Changes
1. Identify which selector(s) broke
2. Update in `config.js`
3. Test with all affected bots
4. Document change in commit message
5. Consider adding alternative selectors

---

## Configuration Patterns

### URL Templates
```javascript
uploadUrlTemplate: 'https://employer.forusall.com/fv_documents_console/{planIdNumber}/manage'

// Usage:
const url = uploadUrlTemplate.replace('{planIdNumber}', planId);
```

### Alternative Selectors
```javascript
otpInput: '#otp_attempt',
otpInputsAlt: [
  'input[name="otp_attempt"]',
  '#otp_code',
  'input[type="tel"][autocomplete="one-time-code"]'
],

// Usage:
const candidates = [selectors.otpInput, ...selectors.otpInputsAlt];
for (const sel of candidates) {
  try {
    await page.click(sel);
    break;
  } catch {}
}
```

### Module Navigation
```javascript
const spec = getSpec('census');
await page.click(spec.navSelector || `a:has-text("${spec.navLabel}")`);
await page.waitForSelector(spec.panelSelector, { state: 'attached' });
```

---

## Testing

### Selector Validation
- Regularly test all selectors against live portal
- Create test suite that validates each selector exists
- Use real portal pages (saved HTML) for offline testing
- Monitor for portal UI updates

### Change Detection
- Set up alerts for portal HTML structure changes
- Compare saved portal snapshots to detect breaking changes
- Test bots against portal staging environment before production

---

## Dependencies
- None (this is pure configuration)
- Consumed by: `/src/bots/`, `/src/engine/auth/loginOtp.js`, extractors

---

## Adding a New Provider

If supporting a new provider (e.g., "ADP", "Fidelity"):
1. Create `/src/providers/newprovider/` directory
2. Create `config.js` with FIXED export
3. Create module map if needed (like participantMap.js)
4. Update bots to accept provider parameter
5. Update engine to support provider-specific logic

---

## Future Enhancements
- **Selector versioning**: Track which portal version selectors are valid for
- **Dynamic selectors**: Load from database/API instead of hardcoded
- **Selector testing**: Automated validation against portal
- **Multi-provider**: Support multiple employer portals

