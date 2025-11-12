# /src/routes/ - API Routes Context

## Purpose
This directory contains all HTTP API route definitions for the ForUsBots service. Routes handle job management, admin operations, data endpoints, and bot-specific endpoints.

## Architecture
```
routes/
├── index.js              # Main router, mounts all sub-routers
├── admin-auth.js         # Admin authentication (login/logout/whoami)
├── admin-jobs-db.js      # Admin job database queries
├── admin-metrics-db.js   # Admin metrics from database
├── data-jobs-db.js       # Data API: job queries (non-admin)
├── data-metrics-db.js    # Data API: metrics queries (non-admin)
├── articles-files.js     # Knowledge base articles (filesystem)
└── articles-draft.js     # Draft articles (admin only)
```

## Key Files

### `index.js` - Main Router
**Purpose**: Central router that mounts all sub-routers and defines core endpoints.

**Core Endpoints**:
- `GET /forusbot/health` - Healthcheck
- `GET /forusbot/status` - Queue status + login locks (configurable auth)
- `GET /forusbot/whoami` - Token validation + role info
- `GET /forusbot/jobs` - List jobs with filters (state, botId, limit, offset)
- `GET /forusbot/jobs/:id` - Get job details by ID
- `DELETE /forusbot/jobs/:id` - Cancel queued job
- `GET /forusbot/locks` - Login lock status (admin only)
- `GET /forusbot/settings` - Runtime settings (admin only)
- `PATCH /forusbot/settings` - Update settings (admin only)
- `GET /forusbot/metrics` - Queue metrics by bot (admin only)
- `GET /forusbot/version` - Service version (admin only)
- `GET /forusbot/openapi` - OpenAPI YAML spec (admin only)
- `POST /forusbot/_close` - Close shared Playwright context (admin only)
- `POST /forusbot/sandbox/vault-file-upload` - Dry-run validator (no auth)

**Bot Mounts**:
```javascript
router.use('/vault-file-upload', forusUploadRoutes);
router.use('/scrape-participant', scrapeParticipantRoutes);
router.use('/search-participants', searchParticipantsRoutes);
router.use('/mfa-reset', mfaResetRoutes);
router.use('/emailtrigger', emailTriggerRoutes);
router.use('/update-participant', updateParticipantRoutes);
```

**Admin Mounts**:
```javascript
router.use('/admin', require('./admin-auth'));
router.use('/admin', require('./admin-metrics-db'));
router.use('/admin', require('./admin-jobs-db'));
```

**Data Mounts**:
```javascript
router.use('/data', dataMetrics);
router.use('/data', dataJobs);
```

**Features**:
- **Job Sanitization**: `toPublicJob()` function normalizes responses, removes sensitive fields (selectors, rawResult).
- **Result Normalization**: Ensures canonical envelope format `{ ok, code, message, data, warnings, errors }`.
- **Configurable Status Auth**: `/status` endpoint can be public, user-only, or admin-only based on flags.

---

### `admin-auth.js`
**Purpose**: Admin authentication endpoints (separate from main auth middleware).

**Endpoints**:
- `POST /forusbot/admin/login` - Issues admin cookie
- `POST /forusbot/admin/logout` - Clears admin cookie
- `GET /forusbot/admin/whoami` - Returns admin status

**Usage**: Powers `/admin` console UI with cookie-based auth.

---

### `admin-jobs-db.js`
**Purpose**: Admin job database queries (direct PostgreSQL access).

**Endpoints**:
- `GET /forusbot/admin/jobs` - Query jobs from audit database
- `DELETE /forusbot/admin/jobs` - Purge all jobs (with confirmation)

**Features**: More powerful queries than in-memory queue (historical data, complex filters).

---

### `admin-metrics-db.js`
**Purpose**: Admin metrics from audit database.

**Endpoints**:
- `GET /forusbot/admin/metrics` - Aggregated metrics (time spent, job counts, stage durations)

**Usage**: Powers admin console KPIs and charts.

---

### `data-jobs-db.js`
**Purpose**: Data API for job queries (non-admin users).

**Endpoints**:
- `GET /forusbot/data/jobs` - Query jobs with filters (requires user role)

**Difference from admin**: May have reduced permissions or filtered results.

---

### `data-metrics-db.js`
**Purpose**: Data API for metrics (non-admin users).

**Endpoints**:
- `GET /forusbot/data/metrics` - Basic metrics (requires user role)

---

### `articles-files.js`
**Purpose**: Knowledge base article API (filesystem-based).

**Endpoints**:
- `GET /forusbot/articles` - List published articles
- `GET /forusbot/articles/:id` - Get article by ID
- `POST /forusbot/articles` - Create article (admin only)
- `PUT /forusbot/articles/:id` - Update article (admin only)
- `DELETE /forusbot/articles/:id` - Delete article (admin only)

**Storage**: Articles stored as JSON files in `docs/knowledge-database/Articles/`.

---

### `articles-draft.js`
**Purpose**: Draft article management (admin only).

**Endpoints**:
- `GET /forusbot/articles-draft` - List drafts
- `POST /forusbot/articles-draft` - Create draft
- `PUT /forusbot/articles-draft/:id` - Update draft
- `DELETE /forusbot/articles-draft/:id` - Delete draft
- `POST /forusbot/articles-draft/:id/publish` - Publish draft to articles

**Storage**: Drafts stored in `docs/knowledge-database/Articles_Draft/`.

---

## When to Work Here

### Modify Routes When:
- Adding new API endpoints
- Changing request/response formats
- Adding query parameters or filters
- Implementing new authentication requirements
- Changing route middleware

### Add New Routes When:
- Creating new bot endpoints (mount in index.js)
- Adding admin features
- Implementing new data APIs
- Adding public endpoints

### DO NOT Modify When:
- Implementing bot logic (use `/src/bots/`)
- Changing queue behavior (use `/src/engine/queue.js`)
- Modifying auth logic (use `/src/middleware/auth.js`)
- Adding utilities (use `/src/engine/utils/`)

---

## Route Patterns

### 202 Accepted Pattern (Jobs)
```javascript
router.post('/some-bot', requireUser, async (req, res) => {
  // 1. Validate input
  // 2. Submit to queue
  const result = queue.submit({ botId, meta, run });
  // 3. Return 202 with jobId
  res.set('Location', `/forusbot/jobs/${result.jobId}`);
  return res.status(202).json({
    ok: true,
    jobId: result.jobId,
    estimate: result.estimate,
    warnings: []
  });
});
```

### Polling Pattern (Job Status)
```javascript
// Client polls GET /forusbot/jobs/:id until state != 'queued' and != 'running'
GET /forusbot/jobs/abc-123
→ { ok: true, state: 'running', stage: 'fill-form', ... }

// Poll again
GET /forusbot/jobs/abc-123
→ { ok: true, state: 'succeeded', result: { ok: true, data: {...} } }
```

### Admin-Only Pattern
```javascript
const { requireAdmin } = require('../middleware/auth');

router.get('/admin-endpoint', requireAdmin, (req, res) => {
  // Only admin tokens pass
});
```

### Configurable Auth Pattern
```javascript
function maybeProtectStatus() {
  const flags = getSettings().flags || {};
  if (flags.statusPublic) return []; // no auth
  if (flags.statusAdminOnly) return [requireAdmin];
  return [requireUser]; // default
}

router.get('/status', ...maybeProtectStatus(), (req, res) => {
  // Auth based on runtime flags
});
```

---

## Response Normalization

### Canonical Envelope
All job results normalized to:
```javascript
{
  ok: boolean,           // Success indicator
  code: string,          // 'OK', 'ERROR', 'PARTIAL', etc.
  message: string|null,  // Human-readable message
  data: object|null,     // Actual result data
  warnings: string[],    // Non-blocking issues
  errors: string[]       // Blocking errors (if ok=false)
}
```

### Job Sanitization
`toPublicJob()` function:
- Removes `selectors` from meta
- Removes `rawResult`
- Normalizes `result` to canonical envelope
- Ensures `stages` is array
- Converts nested evidence paths to strings

---

## Testing

### Unit Tests
- Test route handlers with mocked dependencies (queue, auth)
- Test request validation
- Test response formatting
- Test error handling

### Integration Tests
- Test full request/response cycle
- Test authentication (valid/invalid tokens)
- Test job submission and polling
- Test admin-only routes return 403 for non-admin

### Mock Dependencies
```javascript
// Mock queue
jest.mock('../engine/queue', () => ({
  submit: jest.fn(() => ({ jobId: 'test-123', estimate: {} })),
  getJob: jest.fn(() => ({ state: 'succeeded', result: {} }))
}));

// Mock auth
jest.mock('../middleware/auth', () => ({
  requireUser: (req, res, next) => { req.auth = { role: 'user' }; next(); },
  requireAdmin: (req, res, next) => { req.auth = { role: 'admin' }; next(); }
}));
```

---

## Security

### Input Validation
- Validate all request parameters before processing
- Use strict schemas for complex inputs
- Return 400 for malformed requests
- Return 422 for invalid data

### Output Sanitization
- Never expose internal selectors
- Never expose raw stack traces
- Mask sensitive data in logs
- Use `toPublicJob()` for all job responses

### Rate Limiting
- Consider adding rate limiting middleware (future enhancement)
- Protect expensive endpoints (/jobs, /metrics)

---

## Error Handling

### Standard Errors
```javascript
// 400 Bad Request
{ ok: false, error: 'Missing required field: participantId' }

// 401 Unauthorized
{ ok: false, error: 'unauthorized', warnings: [] }

// 403 Forbidden
{ ok: false, error: 'forbidden', warnings: [] }

// 404 Not Found
{ ok: false, error: 'Job not found' }

// 422 Unprocessable Entity
{ ok: false, error: 'validation_failed', details: [...] }

// 500 Internal Server Error
{ ok: false, error: 'internal_error' }
```

### Error Logging
```javascript
catch (e) {
  console.error('[route-name] error', e);
  return res.status(500).json({ ok: false, error: 'internal_error' });
}
```

---

## Dependencies
- **express**: Router, middleware
- **../engine/queue**: Job management
- **../engine/settings**: Runtime settings
- **../middleware/auth**: Authentication
- **../bots/*/routes**: Bot route modules

---

## Future Enhancements
- **GraphQL endpoint**: Alternative to REST
- **WebSocket support**: Real-time job updates
- **Batch operations**: Submit multiple jobs at once
- **Webhooks**: Notify on job completion
- **Rate limiting**: Per-token limits
- **Request logging**: Structured audit trail

