# /src/engine/ - Core Infrastructure Context

## Purpose
This directory contains the core infrastructure modules that power all automation bots. It provides shared services for browser management, authentication, job queuing, logging, session persistence, and utilities.

## Architecture Overview
The engine is the foundation layer that all bots depend on. It handles:
- Browser/page lifecycle management
- OTP-protected authentication with mutex
- Job queue with concurrency control
- Session reuse (cookies + localStorage)
- Evidence collection (screenshots)
- Structured logging with audit trail
- Utility functions for common operations

## Key Modules

### Authentication & Security
- **`auth/loginOtp.js`**: Centralized login + OTP flow. Handles password auth, TOTP submission, session recovery, and shell verification. **ALWAYS use `ensureAuthForTarget()`**.
- **`loginLock.js`**: OTP mutex to prevent code-step collisions during TOTP windows. Provides `acquireLogin()`, `waitNewTotpWindowIfNeeded()`, `markTotpUsed()`.
- **`sessions.js`**: StorageState persistence (cookies + localStorage). Enables session reuse across jobs. Controlled by `SESSION_REUSE` ENV var.

### Browser Management
- **`browser.js`**: Chromium launcher. Supports ephemeral contexts and persistent contexts (`PERSISTENT_CONTEXT=1`). Provides `launchContext()`, `launchBrowser()`, `createContext()`.
- **`sharedContext.js`**: Page pooling and keep-alive. Manages shared browser context across jobs. Provides `getPageFromPool()`, `releasePage()`, `gotoFast()`, asset blocking logic.

### Job Management
- **`queue.js`**: Job queue with concurrency control, lanes-based ETA estimation, stage tracking, and metrics. Provides `submit()`, `getJob()`, `listJobs()`, `cancel()`, `getMetrics()`.
- **`normalizer.js`**: Result normalization. Converts bot-specific responses to canonical envelope format `{ ok, code, message, data, warnings, errors }`.

### Observability
- **`logger.js`**: Structured JSON logging with event types (`job.accepted`, `job.started`, `stage.succeed`, `job.summary`). Forwards to audit DB when enabled. Provides `log.event()`, `log.info()`, `log.error()`.
- **`evidence.js`**: Screenshot capture for audit trail. Saves to `/tmp/evidence` (or `EVIDENCE_DIR`). Provides `saveEvidence(page, tag, opts)`.
- **`audit.js`**: PostgreSQL audit trail (optional). Records job events, stages, metrics. Controlled by `AUDIT_DB=1` ENV var.

### Configuration
- **`settings.js`**: Runtime settings management (maxConcurrency, flags). Provides `getSettings()`, `patchSettings()`. Allows admin to adjust concurrency without restart.

### Utilities (`/utils/`)
- **`select.js`**: Robust dropdown handling with Unicode normalization. `waitForOptionFlex()`, `selectByText()`.
- **`verify.js`**: Form verification after submission. `waitForFormCleared()` polls until form resets.
- **`date.js`**: Date input helpers. `setEffectiveDate(page, selector, dateStr)`.
- **`pdf.js`**: PDF metadata manipulation. `setPdfTitle(filePath, title)`.
- **`url.js`**: URL template interpolation. `buildUploadUrl(template, planId)`.

## When to Work Here

### Modify Engine When:
- **Adding new auth methods** → Update `auth/loginOtp.js`
- **Changing OTP behavior** → Modify `loginLock.js`
- **Improving browser performance** → Adjust `sharedContext.js` (asset blocking, pooling)
- **Adding queue features** → Update `queue.js`
- **Changing log format** → Modify `logger.js`
- **Adding utilities** → Create new file in `/utils/` or extend existing
- **Modifying session logic** → Update `sessions.js`

### DO NOT Modify When:
- **Implementing bot logic** → Use `/src/bots/`
- **Adding selectors** → Use `/src/providers/`
- **Creating extractors** → Use `/src/extractors/`
- **Adding API routes** → Use `/src/routes/`

## Design Patterns

### Authentication Pattern
```javascript
const { ensureAuthForTarget } = require('./auth/loginOtp');

await ensureAuthForTarget(page, {
  loginUrl: 'https://employer.forusall.com/sign_in',
  targetUrl: 'https://employer.forusall.com/target',
  selectors: { user, pass, loginButton, otpInput, otpSubmit },
  shellSelectors: ['#main-content', 'form#my-form'],
  jobCtx,
  saveSession: true
});
```

### Page Lifecycle Pattern
```javascript
const { getPageFromPool, releasePage } = require('./sharedContext');

let page = null;
try {
  page = await getPageFromPool({ siteUserEmail: SITE_USER });
  // ... use page ...
} finally {
  if (page) await releasePage(page);
}
```

### Job Queue Pattern
```javascript
const queue = require('./queue');

const result = queue.submit({
  botId: 'bot-name',
  meta: { ...params, createdBy: {...} },
  run: (jobCtx) => runFlow({ meta, jobCtx })
});
```

### Logging Pattern
```javascript
const log = require('./logger');

log.event({
  type: 'job.succeeded',
  jobId: '...',
  bot: 'bot-name',
  meta: { ... }
}, 'info');
```

## Critical Dependencies

### External
- **playwright**: Browser automation
- **speakeasy**: TOTP code generation
- **pdf-lib**: PDF manipulation
- **pg**: PostgreSQL client (optional, for audit)

### Internal
- All modules depend on `/src/config.js` for ENV vars
- Bots depend on engine for all infrastructure needs
- No circular dependencies within engine

## Configuration (ENV Variables)

### Browser
- `HEADLESS=1` (0 for debugging)
- `SLOWMO=0` (milliseconds delay between actions)
- `PW_DEFAULT_TIMEOUT=6000` (default Playwright timeout)

### Context Sharing
- `SHARED_CONTEXT=1` (enable page pooling)
- `PAGE_POOL_SIZE=2` (max pages in pool)
- `MAX_IDLE_PAGES=1` (max idle pages to keep)
- `KEEPALIVE_MS=20000` (0 = close immediately)

### Performance
- `BLOCK_IMAGES=0` (block image downloads)
- `BLOCK_FONTS=0` (block font downloads)
- `BLOCK_MEDIA=0` (block video/audio)
- `BLOCK_STYLESHEETS=0` (block CSS)
- `BLOCK_THIRD_PARTY=0` (block analytics/tracking)
- `SCRAPE_BLOCK_ASSETS=0` (shorthand for images+fonts+media)

### Sessions
- `SESSION_REUSE=1` (enable session persistence)
- `SESSION_TTL_HOURS=0` (0 = no expiry)
- `SESSIONS_DIR=.sessions` (storage location)

### Auth
- `SITE_USER` (ForUsAll portal username)
- `SITE_PASS` (ForUsAll portal password)
- `TOTP_SECRET` (Base32 TOTP secret)
- `TOTP_STEP_SECONDS=30` (TOTP window duration)

### Queue
- `MAX_CONCURRENCY=3` (max parallel jobs)
- `ESTIMATE_AVG_SECONDS=120` (default job duration estimate)
- `ESTIMATE_AVG_WINDOW=10` (moving average window)

### Logging
- `LOG_LEVEL=info` (debug|info|warn|error)
- `LOG_FORMAT=json` (json|pretty)
- `SERVICE_NAME=forusbots`

### Evidence
- `EVIDENCE_ENABLED=1` (enable screenshots)
- `EVIDENCE_DIR=/tmp/evidence`

### Audit
- `AUDIT_DB=0` (enable PostgreSQL audit trail)
- `DATABASE_URL=postgresql://...`

## Error Handling
- All functions throw meaningful errors with context
- Use `log.normalizeError(err)` for consistent error format
- Wrap Playwright operations in try/catch
- Always release resources in finally blocks

## Performance Considerations
- Page pooling reduces browser launch overhead
- Session reuse skips login/OTP when possible
- Asset blocking reduces page load time
- Shared context amortizes Chromium startup cost
- Queue concurrency prevents resource exhaustion

## Testing
- Mock Playwright Page/Context/Browser for unit tests
- Mock database connections for audit tests
- Test OTP mutex with concurrent scenarios
- Test queue concurrency limits
- Integration tests should use real browser

## Security
- Never log credentials or OTP codes
- Session files stored with 0600 permissions
- Login mutex prevents TOTP replay attacks
- Audit trail records all job executions
- Token-based auth for all API access

