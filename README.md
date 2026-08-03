# ForUsBots – API (v2.6.0)

Service with **9 Playwright automation bots** for the ForUsAll employer portal:
vault uploads, participant and plan scraping, participant search, participant
MFA reset, participant and plan updates, email triggers, and portal user
management. Login uses TOTP when needed. OpenAPI is the API source of truth.

- English API docs: `/docs/api`
- Spanish API docs: `/docs/api/es`
- OpenAPI: `docs/openapi.yaml` (version 2.6.0)
- Sandbox UI: `/docs/sandbox` (EN), `/docs/sandbox/es` (ES)

---

## Endpoints Summary

Namespace base: `/forusbot`

| Method | Path                                | Auth  | Notes                                                 |
| -----: | ----------------------------------- | :---: | ----------------------------------------------------- |
|    GET | /health                             |  No   | Plain healthcheck                                     |
|    GET | /forusbot/health                    |  No   | Namespaced healthcheck                                |
|    GET | /forusbot/status                    |  Opt  | Public or token based (config)                        |
|    GET | /forusbot/whoami                    |  Yes  | Role and user metadata for token                      |
|   POST | /forusbot/vault-file-upload         |  Yes  | Binary body + headers x-filename, x-meta; returns 202 |
|   POST | /forusbot/sandbox/vault-file-upload |  No   | PDF-only dry-run validator (no job created)           |
|   POST | /forusbot/scrape-participant        |  Yes  | Enqueue scrape; returns 202 with jobId                |
|   POST | /forusbot/scrape-plan               |  Yes  | Enqueue plan scrape; returns 202 with jobId           |
|   POST | /forusbot/search-participants       |  Yes  | Enqueue search; returns 202 with jobId                |
|   POST | /forusbot/mfa-reset                 |  Yes  | Enqueue MFA reset; returns 202 with jobId             |
|   POST | /forusbot/update-participant        |  Yes  | Update participant census; returns 202 with jobId     |
|   POST | /forusbot/update-plan               | Yes\*\* | Update plan edit form; returns 202. Restricted to ivan.alvis@forusall.com |
|   POST | /forusbot/sandbox/update-plan       | Yes\*\* | Dry-run validator for update-plan. Same restriction.  |
|   POST | /forusbot/users-management/create   | Yes\*\* | Create portal user; returns 202. Restricted to ivan.alvis@forusall.com and sponsorservicesbot@forusall.com |
|   POST | /forusbot/users-management/edit     | Yes\*\* | Edit portal user (incl. optional Reset MFA); returns 202. Same restriction. |
|   POST | /forusbot/sandbox/users-management/create | Yes\*\* | Dry-run validator for users-management/create. Same restriction. |
|   POST | /forusbot/sandbox/users-management/edit   | Yes\*\* | Dry-run validator for users-management/edit. Same restriction. |
|   POST | /forusbot/email-trigger             |  Yes  | Trigger email communications; returns 202 with jobId  |
|    GET | /forusbot/jobs                      |  Yes  | List jobs; filters: state, botId, limit, offset       |
|    GET | /forusbot/jobs/:id                  |  Yes  | Get job                                               |
| DELETE | /forusbot/jobs/:id                  |  Yes  | Cancel queued job (409 if running)                    |
|    GET | /forusbot/locks                     | Yes\* | Admin only                                            |
|    GET | /forusbot/settings                  | Yes\* | Admin only                                            |
|  PATCH | /forusbot/settings                  | Yes\* | Admin only                                            |
|    GET | /forusbot/metrics                   | Yes\* | Admin only                                            |
|    GET | /forusbot/version                   | Yes\* | Admin only                                            |
|    GET | /forusbot/openapi                   | Yes\* | Admin only                                            |

> Auth header: `x-auth-token: YOUR_TOKEN` (or `Authorization: Bearer YOUR_TOKEN`).
> `locks`, `settings`, `metrics`, `version`, and `openapi` require an admin
> token. Routes marked Yes\*\* use an additional email allowlist, so an admin
> role alone does not grant access.

---

## Tokens & Scopes

Tokens are loaded from the gitignored `tokens.json` registry. Set
`TOKENS_FILE` to use another path. In managed deployments, the `TOKENS_JSON`
secret can be materialized as that JSON file before the service starts; the
runtime authentication middleware reads the file, not a shared `SHARED_TOKEN`.
Each token entry carries:

- **role** — one of `admin`, `user`, `pa_lead`, `rm_lead`, `ops_lead`, `imp_lead`. Each role has a default set of denied features (see `src/auth/roles.js`).
- **account** — `{alias, siteUser, sitePass, totpSecret}`. The bot uses these credentials to drive the ForUsAll portal when this token invokes a bot. Different tokens can map to different accounts.
- **scope overrides** — `deniedFeatures`, `deniedEndpoints`, `allowedEndpoints`. Per-token overrides that add to (or punch holes in) the role default.

A request is authorized when the resolved feature is not denied and the
`METHOD /path` is not denied. An exact entry in `allowedEndpoints` overrides
both deny lists. Role defaults and token overrides are merged. Scope failures
return `{ok:false,error:"forbidden",feature,endpoint,reason}`; the simpler admin
guard returns `{ok:false,error:"forbidden",warnings:[]}`.

Inspect the effective scope of a token with `GET /forusbot/whoami` (returns `WhoAmI` from the OpenAPI schema). The sandbox UI consumes this endpoint to grey out denied options.

`whoami` returns `role`, `isAdmin`, public user metadata, `accountAlias` (never
portal credentials), and the effective `scope` with `deniedFeatures`,
`deniedEndpoints`, and `allowedEndpoints`.

### Runtime bot IDs

Use these exact values with `GET /forusbot/jobs?botId=...`:
`vault-file-upload`, `scrape-participant`, `scrape-plan`,
`search-participants`, `forusall-mfa-reset`, `update-participant`,
`update-plan`, `forusall-emailtrigger`, and `users-management`.

---

## Quickstart

- Submit an upload (202): see `/docs/api#submit` for full schema.
- For 202 flows, poll the job with `GET /forusbot/jobs/:id` until `state` is `succeeded|failed`.
- The real upload accepts `.pdf`, `.xlsx`, `.xls`, `.csv`, and `.zip`.
- The unauthenticated upload dry-run accepts `.pdf` only.
- `HEADLESS=1` is the preferred browser setting (`HEADLESS=0` for headed local
  debugging). Legacy `HEADFUL` is supported only when `HEADLESS` is unset.

```bash
# Auth header example
-H 'x-auth-token: YOUR_TOKEN'
```

Full examples and schemas: see `/docs/api` (EN) or `/docs/api/es` (ES).

---

## New Endpoints (v2.5.0) — compact cURL

```bash
# 1) Dry-run validator (no auth)
curl -sS -X POST "$BASE/forusbot/sandbox/vault-file-upload" \
  -H 'x-filename: document.pdf' \
  -H 'x-meta: {"planId":580,"formData":{"section":"CONTRACTS & AGREEMENTS","caption":"Recordkeeper Agreement","status":"Audit Ready","effectiveDate":"2025-05-02"}}'
# Docs: /docs/api#sandbox-upload
```

```bash
# 2) Scrape participant (auth)
curl -sS -X POST "$BASE/forusbot/scrape-participant" \
  -H 'x-auth-token: YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"participantId":"12345","modules":["census",{"key":"payroll","fields":["Latest Payroll","years:2026"]}],"return":"data","strict":true}'
# Docs: /docs/api#scrape-participant
```

```bash
# 3) Scrape plan (auth)
curl -sS -X POST "$BASE/forusbot/scrape-plan" \
  -H 'x-auth-token: YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"planId":"627","modules":["basic_info","plan_design"],"return":"data"}'
# Docs: /docs/api#scrape-plan
```

```bash
# 4) Search participants (auth)
curl -sS -X POST "$BASE/forusbot/search-participants" \
  -H 'x-auth-token: YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"criteria":{"fullName":"Jane Doe","ssn":"1234"},"options":{"fetchAllPages":true,"pageLimit":2,"maxRows":50}}'
# Docs: /docs/api#search-participants
```

```bash
# 5) Participant MFA reset (auth)
curl -sS -X POST "$BASE/forusbot/mfa-reset" \
  -H 'x-auth-token: YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"participantId":"12345"}'
# Docs: /docs/api#mfa-reset
```

```bash
# 6) Update participant (auth)
curl -sS -X POST "$BASE/forusbot/update-participant" \
  -H 'x-auth-token: YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"participantId":"12345","note":"Correcting hire date","updates":{"Hire Date":"2024-01-15","State":"CA"}}'
# Docs: /docs/api#update-participant
```

`updates` keys must match the Census UI labels exactly (for example,
`"First Name"`, `"Hire Date"`, `"Primary Email"`, `"Zip Code"`). Internal
camelCase names such as `hireDate` are not accepted.

```bash
# 7) Trigger email (auth)
curl -sS -X POST "$BASE/forusbot/email-trigger" \
  -H 'x-auth-token: YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"planId":627,"emailType":"statement_notice","statement":{"year":2025,"quarter":1,"season":"Q1"}}'
# Docs: /docs/api#emailtrigger
```

```bash
# 8) Update plan (RESTRICTED to ivan.alvis@forusall.com)
curl -sS -X POST "$BASE/forusbot/update-plan" \
  -H 'x-auth-token: IVAN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"planId":"580","note":"Bump default savings rate","updates":{"default_savings_rate":6}}'
# Dry-run (no browser; same access restriction):
curl -sS -X POST "$BASE/forusbot/sandbox/update-plan" \
  -H 'x-auth-token: IVAN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"planId":"580","note":"Validate payload","updates":{"company_name":"Acme"}}'
# Other tokens (incl. admins) → 403 forbidden.
```

```bash
# 9) Create portal user (RESTRICTED)
curl -sS -X POST "$BASE/forusbot/users-management/create" \
  -H 'x-auth-token: ALLOWED_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "user": {
      "firstName": "Jane",
      "lastName": "Doe",
      "email": "jane.doe@example.com",
      "password": "S3cretPass!",
      "passwordConfirmation": "S3cretPass!",
      "role": 2,
      "sponsorIds": [515, 221],
      "active": true,
      "notAnEmployee": true
    },
    "note": "New sponsor admin for acorns"
  }'
# Dry-run (no browser; same access restriction):
curl -sS -X POST "$BASE/forusbot/sandbox/users-management/create" \
  -H 'x-auth-token: ALLOWED_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"user":{"email":"jane@x.com","password":"a","passwordConfirmation":"a"},"note":"validate"}'
# Docs: /docs/api#users-management-create
```

```bash
# 10) Edit portal user (RESTRICTED) — optional resetMfa: "employer"|"admin"|"both"|"none"
curl -sS -X POST "$BASE/forusbot/users-management/edit" \
  -H 'x-auth-token: ALLOWED_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": 1062,
    "updates": { "firstName": "Pension", "role": 3, "active": true },
    "resetMfa": "employer",
    "note": "Update role per sponsor request"
  }'
# Dry-run (no browser; same access restriction):
curl -sS -X POST "$BASE/forusbot/sandbox/users-management/edit" \
  -H 'x-auth-token: ALLOWED_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"userId":1062,"updates":{"firstName":"Pension"},"note":"validate"}'
# Other tokens (incl. admins) → 403 forbidden.
# Docs: /docs/api#users-management-edit
```

---

## OpenAPI & Docs

- OpenAPI: `docs/openapi.yaml` (version 2.6.0)
- English docs: `/docs/api` — Spanish docs: `/docs/api/es`
- Sandbox: `/docs/sandbox` (EN), `/docs/sandbox/es` (ES)

---

## Changelog

- 2.6.0 (2026-08-03)
  - Added durable Firestore-backed idempotency for participant and plan scrape submissions using `Idempotency-Key`.
  - Documented replay, conflict, and temporary durability-failure responses without exposing raw authentication tokens.

- 2.5.0 documentation audit (2026-07-16)
  - Aligned `update-participant` with the exact Census UI labels accepted by runtime.
  - Documented all 9 bots, runtime bot IDs, token roles/scopes and complete `whoami`.
  - Corrected admin permissions, `HEADLESS` precedence, public job shapes, ZIP support, and the PDF-only upload dry-run.
  - Brought English and Spanish Docs/API pages and navigation into parity.

- 2.5.0
  - Added `POST /forusbot/users-management/create` and `POST /forusbot/users-management/edit` for portal user administration (create/edit users, multi-select sponsor/group/payroll IDs, optional Reset MFA admin/employer/both).
  - Added matching sandbox dry-runs: `POST /forusbot/sandbox/users-management/{create,edit}`.
  - Both real and sandbox endpoints are restricted to `ivan.alvis@forusall.com` and `sponsorservicesbot@forusall.com`.
  - Registered `users-management` and `sandbox-users-management` features in the scope map (`src/auth/featureMap.js`, `src/auth/roles.js`) — denied by default for `user`, `pa_lead`, `rm_lead`, `imp_lead`.

- 2.3.0
  - Added `POST /forusbot/email-trigger` for triggering email communications to participants (10 email types supported).
  - Added `POST /forusbot/scrape-plan` for extracting plan configuration data (6 modules, 67 total fields).
  - Added `POST /forusbot/update-participant` for updating participant census data.
  - Updated all documentation to reflect version 2.3.0 and complete bot coverage.
  - Enhanced OpenAPI spec with comprehensive schemas and examples for all bots.

- 2.2.0
  - Added docs for: scrape-participant, search-participants, mfa-reset, and sandbox dry-run endpoint.
  - Fixed OpenAPI coverage and aligned badges to v2.2.0.
  - Translated Spanish sandbox page (text only).
  - Updated EN/ES docs home with cards linking to new sections.
