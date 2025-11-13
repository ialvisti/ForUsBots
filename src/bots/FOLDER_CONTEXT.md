# /src/bots/ - Automation Bots Context

## Purpose
This directory contains all automation bots that perform specific tasks in the ForUsAll employer portal. Each bot is a self-contained module with its own routes, controller, and flow logic.

## Bot Architecture
Every bot follows a strict 3-file structure:
```
bot-name/
├── routes.js      # Express router (HTTP endpoints)
├── controller.js  # Request validation + job submission
└── runFlow.js     # Automation logic (Playwright)
```

## Available Bots

### 1. `/forusall-upload/`
**Purpose**: Uploads PDF documents to the ForUsAll vault with metadata (section, caption, status, effective date).
**Endpoints**: `POST /forusbot/vault-file-upload`
**Features**: Binary file upload, form filling, submission verification via DOM polling.
**When to use**: Document automation, vault file management.

### 2. `/forusall-scrape-participant/`
**Purpose**: Extracts structured data from participant pages (census, loans, payroll, plan details, savings rate, MFA).
**Endpoints**: `POST /forusbot/scrape-participant`
**Features**: Module-based extraction, field filtering, HTML/text/data output modes.
**When to use**: Participant data extraction, report generation.

### 3. `/forusall-scrape-plan/`
**Purpose**: Extracts structured data from plan configuration pages (basic info, design, onboarding, communications, settings, feature flags).
**Endpoints**: `POST /forusbot/scrape-plan`
**Features**: Module-based extraction (6 modules, 67 fields), field filtering, HTML/text/data output modes, strict validation.
**When to use**: Plan data extraction, configuration audits, compliance reporting.

### 4. `/forusall-mfa-reset/`
**Purpose**: Resets multi-factor authentication for a participant.
**Endpoints**: `POST /forusbot/mfa-reset`
**Features**: MFA panel navigation, reset button click, status verification.
**When to use**: User support, MFA troubleshooting.

### 5. `/forusall-search-participants/`
**Purpose**: Searches participants by criteria (name, SSN, email, phone, participant ID).
**Endpoints**: `POST /forusbot/search-participants`
**Features**: Multi-page search, result pagination, data extraction from search table.
**When to use**: Bulk participant lookup, data verification.

### 6. `/forusall-update-participant/`
**Purpose**: Updates participant census data fields (name, address, dates, eligibility status).
**Endpoints**: `POST /forusbot/update-participant`
**Features**: Field mapping, validation, note creation, batch updates.
**When to use**: Participant data maintenance, bulk updates.

### 7. `/forusall-emailtrigger/`
**Purpose**: Triggers email flows in the ForUsAll portal (onboarding, statements, sponsor emails, generic).
**Endpoints**: `POST /forusbot/emailtrigger`
**Features**: Multi-flow support, preview validation, participant selection, form filling.
**When to use**: Email campaign automation, participant communication.
**Subdirectory**: `/flows/` contains flow-specific logic (summary_annual_notice.js, etc.).

## Standard Bot Pattern

### routes.js
```javascript
const router = require('express').Router();
const controller = require('./controller');
const requireUser = require('../../middleware/auth');

router.post('/', requireUser, controller);

module.exports = router;
```

### controller.js
```javascript
const queue = require('../../engine/queue');
const requireUser = require('../../middleware/auth');

module.exports = async function controller(req, res) {
  // 1. Extract & validate input
  // 2. Pre-flight validations (return 422 if invalid)
  // 3. Build meta object
  // 4. Submit to queue (202 pattern)
  // 5. Return 202 with jobId + estimate
};
```

### runFlow.js
```javascript
const { getPageFromPool, releasePage } = require('../../engine/sharedContext');
const { ensureAuthForTarget } = require('../../engine/auth/loginOtp');

module.exports = async function runFlow({ meta, jobCtx }) {
  let page = null;
  try {
    page = await getPageFromPool({ siteUserEmail: SITE_USER });
    
    // Auth
    jobCtx?.setStage?.('auth');
    await ensureAuthForTarget(page, { ... });
    
    // Main logic
    jobCtx?.setStage?.('main-work');
    // ... automation ...
    
    jobCtx?.setStage?.('done');
    return { ok: true, message: '...', data: {...} };
  } finally {
    if (page) await releasePage(page);
  }
};
```

## When to Work Here

### Add a New Bot
1. Create new subdirectory: `/forusall-<bot-name>/`
2. Add `routes.js`, `controller.js`, `runFlow.js`
3. Register in `/src/routes/index.js`
4. Update `.cursorrules` and documentation

### Modify Existing Bot
- **routes.js**: When adding/removing endpoints, changing HTTP methods
- **controller.js**: When adding validation logic, changing request/response format
- **runFlow.js**: When modifying automation logic, adding stages, changing Playwright interactions

### DO NOT Modify When:
- Changing selectors (use `/src/providers/forusall/config.js`)
- Adding utilities (use `/src/engine/utils/`)
- Modifying auth logic (use `/src/engine/auth/`)
- Changing queue behavior (use `/src/engine/queue.js`)

## Best Practices

### Controller Validation
- Validate all inputs before enqueuing
- Return 422 for validation errors
- Return 400 for malformed requests
- Include warnings array for non-blocking issues

### runFlow Stage Tracking
- Always call `jobCtx?.setStage?.('stage-name', { meta })` for telemetry
- Stages: `'auth'`, `'fill-form'`, `'submit'`, `'verify'`, `'done'`
- Include relevant metadata in stage calls

### Error Handling
- Wrap all Playwright operations in try/catch
- Always call `releasePage(page)` in finally block
- Return structured errors: `{ ok: false, error: 'error_code', message: '...' }`
- Use `saveEvidence(page, tag)` before throwing errors

### Performance
- Use `gotoFast()` for navigation
- Minimize waitForTimeout() calls
- Prefer `waitForSelector()` over fixed delays
- Use page pooling (already handled by `getPageFromPool()`)

## Testing
- Test controller validation logic (unit tests)
- Mock `queue.submit()` in controller tests
- Integration tests should use Playwright Test
- Test error handling and edge cases

## Security
- Never hardcode credentials in bot files
- Load from `config.js` (SITE_USER, SITE_PASS, TOTP_SECRET)
- Use auth middleware in routes.js
- Include `createdBy` metadata in job submissions
- Never log sensitive request data

## Common Imports
```javascript
// Page management
const { getPageFromPool, releasePage } = require('../../engine/sharedContext');

// Authentication
const { ensureAuthForTarget } = require('../../engine/auth/loginOtp');

// Queue
const queue = require('../../engine/queue');

// Auth middleware
const requireUser = require('../../middleware/auth');

// Config
const { SITE_USER, SITE_PASS, TOTP_SECRET } = require('../../config');

// Utilities
const { selectByText, waitForOptionFlex } = require('../../engine/utils/select');
const { waitForFormCleared } = require('../../engine/utils/verify');
const { saveEvidence } = require('../../engine/evidence');

// Provider config
const { FIXED } = require('../../providers/forusall/config');
```

## Flow-Specific Subdirectories
Some bots have `/flows/` subdirectories (e.g., emailtrigger) for complex multi-variant logic. Each flow exports its own handler function.

