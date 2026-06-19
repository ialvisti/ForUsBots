# ForUsBots — Project Structure Map

> **🎯 Quick Start:** Read this file FIRST to understand where everything lives. It is the single navigation map for the repository.

## 📊 Project Overview

ForUsBots is a Node.js (CommonJS) service that automates the ForUsAll employer portal with **Playwright** (Chromium, login + TOTP), processes uploads, extracts participant/plan data, and exposes a small HTTP API under `/forusbot`. Docs are bilingual (EN/ES) and `docs/openapi.yaml` is the source of truth.

```
ForUsBots/
├── 🏠 Root config & entry points
├── 📦 src/                  Core application source
│   ├── 🤖 bots/             Automation bots (one folder per bot)
│   ├── 🔐 auth/             Token roles, scopes & feature map
│   ├── ⚙️  engine/           Browser/queue/session/logging infrastructure
│   ├── 📤 extractors/        Participant & plan data extractors
│   ├── 🔌 providers/         Provider config (URLs & selectors)
│   ├── 🧱 middleware/        Express middleware (auth, scopes, formatters)
│   ├── 🛣️  routes/            HTTP API route definitions
│   └── 💾 db/                Firestore + BigQuery clients
├── 📚 docs/                 Bilingual docs site, OpenAPI, sandbox, admin/data consoles, KB
├── 🔧 scripts/              Operational scripts (health, validation, monitoring)
├── 📋 examples/             Integration examples (curl, n8n, email-trigger)
├── 📊 bq/                   BigQuery views (SQL) + apply script
├── 🧩 extensions/           Firebase extension configs (firestore→bigquery export)
└── 🗺️  GCP Implementation/   GCP migration planning docs (logging, Firestore, infra, scopes)
```

> **Stack:** Node.js (CommonJS), Express 5.x, Playwright 1.54.x (Chromium), Firestore + BigQuery (data/metrics), optional PostgreSQL audit trail (`src/engine/audit.js`). Containerized via Docker; deploy targets include Cloud Run and Render.

> **There is no `migrations/` or `forusall-portal-html-data/` directory.** Persistence lives in `src/db/` (Firestore/BigQuery) and the optional Postgres audit trail. Earlier revisions of this map referenced SQL migrations and an HTML-fixtures folder that no longer exist.

---

## 🗺️ Folder Map

### 🏠 Root Directory

Config, deployment, and entry metadata:

- `package.json` — dependencies and npm scripts
- `Dockerfile` — Playwright-based container image
- `cloudbuild.yaml` / `render.yaml` — deployment configs (Cloud Build / Render)
- `firebase.json` / `.firebaserc` — Firebase project config
- `README.md` — project overview, endpoint summary, quickstart, changelog
- `PROJECT_STRUCTURE.md` — this navigation map
- `.gitignore` — ignores `tokens.json`, `.sessions`, `.env`, `.user-data`
- `tokens.json` (gitignored) — token → role/account/scope map, loaded at startup
- `.env` (gitignored) — local environment variables
- `payload.json` — sample request payload

**Work here for:** dependencies, Docker/deploy config, root docs.
**Not here for:** bot logic (`src/bots/`), utilities (`src/engine/utils/`), API changes (`src/routes/`).

---

### 📦 /src/ — Application Source

Entry points and config:

- `index.js` — process entry point (HTTP server + signal handlers)
- `server.js` — Express app setup and middleware wiring
- `config.js` — environment-variable configuration
- `secrets.js` — secret resolution (env / Secret Manager)

Subdirectories: `bots/`, `auth/`, `engine/`, `extractors/`, `providers/`, `middleware/`, `routes/`, `db/` (detailed below).

---

### 🤖 /src/bots/ — Automation Bots

Each bot follows the standard 3-file structure:

```
bot-name/
├── routes.js      # Express router
├── controller.js  # Request validation + job submission (202 pattern)
└── runFlow.js     # Playwright automation logic
```

**The 9 bots:**

| Bot | Endpoint(s) | Purpose |
|-----|-------------|---------|
| `forusall-upload` | `POST /forusbot/vault-file-upload` | Upload a document (`.pdf`, `.xlsx`, `.xls`, `.csv`, `.zip`) to the vault with metadata |
| `forusall-scrape-participant` | `POST /forusbot/scrape-participant` | Extract participant data (census, savings, loans, plan, payroll, MFA) |
| `forusall-scrape-plan` | `POST /forusbot/scrape-plan` | Extract plan configuration (6 modules) |
| `forusall-search-participants` | `POST /forusbot/search-participants` | Search participants by name/SSN/email |
| `forusall-mfa-reset` | `POST /forusbot/mfa-reset` | Reset participant MFA |
| `forusall-update-participant` | `POST /forusbot/update-participant` | Update participant census fields |
| `forusall-update-plan` | `POST /forusbot/update-plan` (+ sandbox) | Update plan edit form. **Restricted** to `ivan.alvis@forusall.com` |
| `forusall-emailtrigger` | `POST /forusbot/email-trigger` | Trigger portal emails. Has `flows/` for per-email-type logic |
| `forusall-usersmanagement` | `POST /forusbot/users-management/{create,edit}` (+ sandbox) | Create/edit portal users + optional Reset MFA. **Restricted** to `ivan.alvis@forusall.com` and `sponsorservicesbot@forusall.com`. Has `web/` HTML references |

Access restrictions are enforced by `src/middleware/restrictToEmails.js`; the `users-management` and `update-plan` features are denied by default for non-admin roles (`src/auth/roles.js`).

**Work here for:** new bots, bot logic changes, new bot endpoints.
**Not here for:** selectors (`src/providers/forusall/config.js`), shared utilities (`src/engine/utils/`), auth (`src/auth/`, `src/middleware/`).

---

### 🔐 /src/auth/ — Token Roles & Scopes

The authorization engine that resolves what each token may do.

- `roles.js` — role definitions and per-role default denied features (`admin`, `user`, `pa_lead`, `rm_lead`, `ops_lead`, `imp_lead`)
- `featureMap.js` — maps `method+path` → feature name
- `scopes.js` — scope resolution algorithm (`deniedFeatures`, `deniedEndpoints`, `allowedEndpoints`) + `scopeToJSON`
- `account.js` — per-token portal account `{alias, siteUser, sitePass, totpSecret}`

Enforced at request time by `src/middleware/requireScope.js`. Inspect a token's effective scope with `GET /forusbot/whoami`.

---

### ⚙️ /src/engine/ — Core Infrastructure

Shared infrastructure used by all bots:

- `auth/loginOtp.js` — centralized login + OTP (`ensureAuthForTarget`). **Always use this.**
- `browser.js` — Chromium launcher
- `sharedContext.js` — page pooling & keep-alive
- `sessions.js` — session persistence (cookies + localStorage)
- `loginLock.js` — OTP mutex (prevents TOTP-window collisions)
- `queue.js` — in-memory job queue with concurrency control + ETA estimation
- `logger.js` + `log-context.js` — structured JSON logging (correlation IDs via AsyncLocalStorage); see `log-schema.md`
- `evidence.js` — screenshot utilities
- `normalizer.js` — result envelope normalization
- `settings.js` — runtime settings (concurrency, flags)
- `audit.js` — optional PostgreSQL audit trail
- `utils/` — reusable Playwright helpers: `select.js`, `verify.js`, `date.js`, `pdf.js`, `url.js`

**Work here for:** auth/OTP logic, browser performance, queue behavior, logging format.
**Not here for:** bot-specific logic (`src/bots/`), extraction (`src/extractors/`), routes (`src/routes/`).

---

### 📤 /src/extractors/ — Data Extraction

Structured extraction from portal pages:

```
extractors/
├── forusall-participant/
│   ├── modules/   # census, savings_rate, loans, plan_details, payroll, mfa
│   ├── registry.js
│   └── utils.js
└── forusall-plan/
    ├── modules/   # basic_info, plan_design, onboarding, communications, extra_settings, feature_flags
    ├── registry.js
    └── utils.js
```

**Work here for:** new extractable fields, new extraction modules, parsing fixes.
**Not here for:** navigation (bot `runFlow.js`), selectors (`src/providers/`).

---

### 🔌 /src/providers/ — Provider Configuration

```
providers/forusall/
├── config.js          # URLs & ALL CSS selectors (SOURCE OF TRUTH for selectors)
├── participantMap.js  # Participant module specs
└── planMap.js         # Plan module specs
```

**CRITICAL:** `config.js` is the only place to update selectors.

---

### 🧱 /src/middleware/ — Express Middleware

- `auth.js` — token authentication (`requireUser`, `requireAdmin`, default export = `requireUser`)
- `requireScope.js` — scope/feature enforcement (403 with `{feature, endpoint, reason}`)
- `restrictToEmails.js` — per-endpoint email allowlist (used by restricted bots)
- `public-response.js` / `public-formatters.js` — public job-shape formatting (`toPublicJob`)
- `request-log.js` — per-request logging + correlation IDs

**Token storage:** `tokens.json` (gitignored, loaded at startup).

---

### 🛣️ /src/routes/ — API Routes

- `index.js` — main `/forusbot` router: health/status, jobs, locks, settings, metrics, version, openapi, whoami, `_close`, sandbox dry-runs, and all bot mounts
- `admin-auth.js` — admin login/logout/whoami
- `admin-jobs-db.js` / `admin-metrics-db.js` — admin job/metric queries from the data store
- `articles-files.js` / `articles-draft.js` — knowledge-base article APIs

**Work here for:** new endpoints, request/response shape, route middleware.
**Not here for:** bot implementation (`src/bots/`), queue logic (`src/engine/queue.js`).

---

### 💾 /src/db/ — Data Layer

- `firestore.js` — Firestore client (jobs/metrics persistence)
- `bigquery.js` — BigQuery client (analytics export)

Companion artifacts: `bq/views/*.sql` (BigQuery views) and `extensions/*.env` (Firebase firestore→bigquery export configs). The optional Postgres audit trail lives in `src/engine/audit.js`.

---

### 📚 /docs/ — Documentation Website

- `index.html` — docs home (EN); `es/index.html` — docs home (ES)
- `openapi.yaml` — **API spec, source of truth (v2.5.0)**
- `api/index.html` (EN) + `api/es/index.html` (ES) — API reference
- `sandbox/` — interactive testing UI (`index.html`, `js/`, `es/`)
- `admin/` — admin console (dashboard, jobs, metrics)
- `data/` — non-admin data console
- `evidence/` — evidence browser
- `knowledge-database/` — internal KB (`Articles/`, `Css/`, `Js/`, `Images/`)

**IMPORTANT:** Update `openapi.yaml` BEFORE the HTML docs. Keep EN/ES in parity.

---

### 🔧 /scripts/ — Utility Scripts

- `healthcheck.sh` — Docker health check
- `audit-smoke.js` — audit DB smoke test
- `validate-jobs.mjs` / `validate-jobs-deep.mjs` — job data validation (deep = DB cross-checks)
- `test-public-shape.sh` — public response-shape test
- `test-scopes.mjs` — token scope tests
- `setup-monitoring.sh` — monitoring setup

---

### 📋 /examples/ — Integration Examples

- `curl.sh` — curl examples for the API
- `forus-bot-n8n.json` — n8n workflow template
- `emailtrigger-year-end-notice.js` / `.sh` — year-end-notice email-trigger examples

---

### 🗺️ /GCP Implementation/ — Migration Planning

Planning docs for the GCP migration: logging refactor, public-payload cleanup, infra provisioning, Firestore data layer, deploy/cutover, per-token scopes (`06-token-scopes/`), and Looker Studio dashboards. These are point-in-time planning artifacts, not runtime code.

---

## 🧭 Quick Navigation — "I need to…"

| Task | Go to |
|------|-------|
| Add a new bot | Create folder in `src/bots/` (routes/controller/runFlow), register in `src/routes/index.js` |
| Update portal selectors | `src/providers/forusall/config.js` |
| Add a shared utility | `src/engine/utils/` |
| Create a data extractor | `src/extractors/.../modules/` + register in `registry.js` |
| Change token roles/scopes | `src/auth/roles.js`, `src/auth/featureMap.js` |
| Update API docs | `docs/openapi.yaml` FIRST, then `docs/api/` HTML (EN+ES) |
| Change queue/concurrency | `src/engine/queue.js`, `src/engine/settings.js` |
| Add API endpoint | `src/routes/index.js` (or a new router) |

---

## 📌 Critical Rules

- **Selectors** live only in `src/providers/forusall/config.js`.
- **Login/OTP** always goes through `ensureAuthForTarget()` in `src/engine/auth/loginOtp.js`; never bypass the OTP mutex.
- **Release pages** with `releasePage()` in a `finally` block.
- **Never commit** `tokens.json`, `.env`, `.sessions`, or any credentials.
- **OpenAPI first:** update `docs/openapi.yaml` before HTML docs.

---

## 📊 Project Stats

- **Bots:** 9
- **HTTP endpoints:** 24 under `/forusbot` (see `docs/openapi.yaml`)
- **Extractor modules:** 12 (6 participant + 6 plan)
- **Engine utilities:** 5 (`select`, `verify`, `date`, `pdf`, `url`)
- **Roles:** 6 (`admin`, `user`, `pa_lead`, `rm_lead`, `ops_lead`, `imp_lead`)
- **Documentation:** bilingual (EN/ES)

---

## 🔗 Related Files

- `.cursor/rules/rules.mdc` — development rules and conventions
- `README.md` — project overview, endpoint table, changelog
- `docs/openapi.yaml` — API specification (source of truth)
- `src/engine/log-schema.md` — log record schema

---

**Last Updated:** 2026-06-19
**API Version:** 2.5.0
