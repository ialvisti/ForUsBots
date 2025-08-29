# ForUsBots – API (v2.2.0)

Service that automates ForUsAll employer portal actions using Playwright (login with TOTP when needed), processes uploads, and exposes a small HTTP API. Docs are available in English and Spanish; OpenAPI is the source of truth.

- English API docs: `/docs/api`
- Spanish API docs: `/docs/api/es`
- OpenAPI: `docs/openapi.yaml` (version 2.2.0)
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
|   POST | /forusbot/sandbox/vault-file-upload |  No   | Dry-run validator (no job created)                    |
|   POST | /forusbot/scrape-participant        |  Yes  | Enqueue scrape; returns 202 with jobId                |
|   POST | /forusbot/search-participants       |  Yes  | Enqueue search; returns 202 with jobId                |
|   POST | /forusbot/mfa-reset                 |  Yes  | Enqueue MFA reset; returns 202 with jobId             |
|    GET | /forusbot/jobs                      |  Yes  | List jobs; filters: state, botId, limit, offset       |
|    GET | /forusbot/jobs/:id                  |  Yes  | Get job                                               |
| DELETE | /forusbot/jobs/:id                  |  Yes  | Cancel queued job (409 if running)                    |
|    GET | /forusbot/locks                     | Yes\* | Admin only                                            |
|    GET | /forusbot/settings                  | Yes\* | Admin only                                            |
|  PATCH | /forusbot/settings                  | Yes\* | Admin only                                            |
|    GET | /forusbot/metrics                   | Yes\* | Admin only                                            |
|    GET | /forusbot/version                   | Yes\* | Admin only                                            |
|    GET | /forusbot/openapi                   | Yes\* | Admin only                                            |

> Auth header: `x-auth-token: YOUR_TOKEN`. Admin routes require an admin token.

---

## Quickstart

- Submit an upload (202): see `/docs/api#submit` for full schema.
- For 202 flows, poll the job with `GET /forusbot/jobs/:id` until `state` is `succeeded|failed`.

```bash
# Auth header example
-H 'x-auth-token: YOUR_TOKEN'
```

Full examples and schemas: see `/docs/api` (EN) or `/docs/api/es` (ES).

---

## New Endpoints (v2.2.0) — compact cURL

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
  -d '{"participantId":"12345","modules":["census"],"return":"data","strict":true}'
# Docs: /docs/api#scrape-participant
```

```bash
# 3) Search participants (auth)
curl -sS -X POST "$BASE/forusbot/search-participants" \
  -H 'x-auth-token: YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"criteria":{"fullName":"Jane Doe","ssn":"1234"},"options":{"fetchAllPages":true,"pageLimit":2,"maxRows":50}}'
# Docs: /docs/api#search-participants
```

```bash
# 4) Participant MFA reset (auth)
curl -sS -X POST "$BASE/forusbot/mfa-reset" \
  -H 'x-auth-token: YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"participantId":"12345"}'
# Docs: /docs/api#mfa-reset
```

---

## OpenAPI & Docs

- OpenAPI: `docs/openapi.yaml` (version 2.2.0)
- English docs: `/docs/api` — Spanish docs: `/docs/api/es`
- Sandbox: `/docs/sandbox` (EN), `/docs/sandbox/es` (ES)

---

## Changelog

- 2.2.0
  - Added docs for: scrape-participant, search-participants, mfa-reset, and sandbox dry-run endpoint.
  - Fixed OpenAPI coverage and aligned badges to v2.2.0.
  - Translated Spanish sandbox page (text only).
  - Updated EN/ES docs home with cards linking to new sections.
