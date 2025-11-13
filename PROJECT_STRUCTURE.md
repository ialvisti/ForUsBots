# ForUsBots - Project Structure Map

> **🎯 AI Agent Quick Start:** Read this file FIRST to understand where everything is located, then dive into specific `FOLDER_CONTEXT.md` files for details.

## 📊 Project Overview

```
ForUsBots/
├── 🏠 Root Config & Entry Points
├── 📦 src/                          Core application source code
│   ├── 🤖 bots/                     Individual automation bots
│   ├── ⚙️  engine/                   Core infrastructure & utilities
│   ├── 📤 extractors/               Data extraction modules
│   ├── 🔌 providers/                Provider-specific config
│   ├── 🔐 middleware/               Express middleware
│   └── 🛣️  routes/                   API route definitions
├── 📚 docs/                         Documentation website
├── 💾 migrations/                   Database migrations
├── 🔧 scripts/                      Utility scripts
├── 📋 examples/                     Integration examples
└── 🧪 forusall-portal-html-data/   Test fixtures (HTML snapshots)
```

---

## 🗺️ Complete Folder Map

### 🏠 Root Directory
**Location**: `/`  
**Context File**: `/FOLDER_CONTEXT.md`

**What's Here**:
- `package.json` - Dependencies, scripts, project metadata
- `Dockerfile` - Container definition (Playwright base image)
- `.gitignore` - Ignored files (tokens.json, .sessions, .env)
- `.cursorrules` / `.cursor/rules/rules.mdc` - Development rules
- `README.md` - Project overview and quickstart
- `render.yaml` - Deployment configuration

**When to Work Here**:
- ✅ Updating dependencies (package.json)
- ✅ Modifying Docker configuration
- ✅ Changing deployment settings
- ✅ Updating root documentation

**DO NOT Work Here For**:
- ❌ Bot implementation (→ `/src/bots/`)
- ❌ Adding utilities (→ `/src/engine/utils/`)
- ❌ API changes (→ `/src/routes/`)

---

### 📦 /src/ - Application Source
**Location**: `/src/`  
**Context File**: `/src/FOLDER_CONTEXT.md`

**What's Here**:
- `index.js` - Entry point (HTTP server + signal handlers)
- `server.js` - Express app setup
- `config.js` - Environment variable configuration

**Subdirectories** (detailed below):
- `/src/bots/` - Automation bots
- `/src/engine/` - Core infrastructure
- `/src/extractors/` - Data extraction
- `/src/providers/` - Provider config
- `/src/middleware/` - Auth middleware
- `/src/routes/` - API routes

**When to Work Here**:
- ✅ Modifying server setup (server.js)
- ✅ Changing entry point logic (index.js)
- ✅ Updating ENV config (config.js)

---

### 🤖 /src/bots/ - Automation Bots
**Location**: `/src/bots/`  
**Context File**: `/src/bots/FOLDER_CONTEXT.md`

**What's Here**: Individual automation bots, each with standard 3-file structure:
```
bot-name/
├── routes.js      # Express router
├── controller.js  # Request validation + job submission
└── runFlow.js     # Playwright automation logic
```

**Available Bots**:
1. **`forusall-upload/`** - Document upload to vault
   - Endpoint: `POST /forusbot/vault-file-upload`
   - Purpose: PDF upload with metadata

2. **`forusall-scrape-participant/`** - Participant data extraction
   - Endpoint: `POST /forusbot/scrape-participant`
   - Purpose: Extract census, loans, payroll, etc.

3. **`forusall-scrape-plan/`** - Plan data extraction
   - Endpoint: `POST /forusbot/scrape-plan`
   - Purpose: Extract plan configuration (6 modules, 67 fields)

4. **`forusall-mfa-reset/`** - MFA reset
   - Endpoint: `POST /forusbot/mfa-reset`
   - Purpose: Reset participant MFA

5. **`forusall-search-participants/`** - Participant search
   - Endpoint: `POST /forusbot/search-participants`
   - Purpose: Search by name, SSN, email, etc.

6. **`forusall-update-participant/`** - Participant updates
   - Endpoint: `POST /forusbot/update-participant`
   - Purpose: Update census fields

7. **`forusall-emailtrigger/`** - Email triggering
   - Endpoint: `POST /forusbot/emailtrigger`
   - Purpose: Trigger portal emails
   - Has `/flows/` subdirectory for multi-flow logic

**When to Work Here**:
- ✅ Creating new automation bots
- ✅ Modifying existing bot logic
- ✅ Adding new bot endpoints

**DO NOT Work Here For**:
- ❌ Changing selectors (→ `/src/providers/forusall/config.js`)
- ❌ Adding utilities (→ `/src/engine/utils/`)
- ❌ Modifying auth (→ `/src/engine/auth/`)

---

### ⚙️ /src/engine/ - Core Infrastructure
**Location**: `/src/engine/`  
**Context File**: `/src/engine/FOLDER_CONTEXT.md`

**What's Here**: Shared infrastructure used by all bots

**Key Modules**:
- **`auth/loginOtp.js`** - Centralized login + OTP (CRITICAL: always use this)
- **`browser.js`** - Chromium launcher
- **`sharedContext.js`** - Page pooling & keep-alive
- **`sessions.js`** - Session persistence (cookies + localStorage)
- **`loginLock.js`** - OTP mutex (prevents code collision)
- **`queue.js`** - Job queue with concurrency control
- **`logger.js`** - Structured JSON logging
- **`evidence.js`** - Screenshot utilities
- **`normalizer.js`** - Result envelope normalization
- **`settings.js`** - Runtime settings management
- **`audit.js`** - PostgreSQL audit trail

**Subdirectory**:
- **`utils/`** - Common utilities (select, verify, date, pdf, url)

**When to Work Here**:
- ✅ Modifying authentication logic
- ✅ Improving browser performance
- ✅ Adding core infrastructure features
- ✅ Changing queue behavior
- ✅ Updating logging format

**DO NOT Work Here For**:
- ❌ Bot-specific logic (→ `/src/bots/`)
- ❌ Data extraction (→ `/src/extractors/`)
- ❌ API routes (→ `/src/routes/`)

---

### 🛠️ /src/engine/utils/ - Utility Functions
**Location**: `/src/engine/utils/`  
**Context File**: `/src/engine/utils/FOLDER_CONTEXT.md`

**What's Here**: Reusable Playwright utilities

**Available Utilities**:
- **`select.js`** - Dropdown handling with Unicode normalization
  - `waitForOptionFlex()` - Wait for dropdown option
  - `selectByText()` - Select by visible text

- **`verify.js`** - Form verification after submission
  - `waitForFormCleared()` - Poll until form resets

- **`date.js`** - Date input helpers
  - `setEffectiveDate()` - Fill date inputs

- **`pdf.js`** - PDF metadata manipulation
  - `setPdfTitle()` - Rewrite PDF title

- **`url.js`** - URL template interpolation
  - `buildUploadUrl()` - Build URLs from templates

**When to Work Here**:
- ✅ Adding reusable Playwright utilities
- ✅ Fixing bugs in shared utilities
- ✅ Improving Unicode handling

**DO NOT Work Here For**:
- ❌ Bot-specific helpers (keep in bot's runFlow.js)
- ❌ Data extraction (→ `/src/extractors/`)

---

### 📤 /src/extractors/ - Data Extraction
**Location**: `/src/extractors/`  
**Context File**: `/src/extractors/FOLDER_CONTEXT.md`

**What's Here**: Modules that extract structured data from participant pages

**Structure**:
```
extractors/
├── forusall-participant/     # Participant data extractors
│   ├── modules/              # Individual extractors
│   │   ├── census.js         # Demographics & employment
│   │   ├── savings_rate.js   # Contribution settings
│   │   ├── loans.js          # Loan information
│   │   ├── plan_details.js   # Plan enrollment
│   │   ├── payroll.js        # Payroll history
│   │   └── mfa.js            # MFA status
│   ├── registry.js           # Extractor lookup & validation
│   └── utils.js              # Shared extraction helpers
└── forusall-plan/            # Plan data extractors
    ├── modules/              # Plan extractors
    │   ├── basic_info.js     # Plan ID, company, EIN, status
    │   ├── plan_design.js    # Eligibility, contributions
    │   ├── onboarding.js     # Dates, conversion settings
    │   ├── communications.js # Branding, messaging
    │   ├── extra_settings.js # Advanced rules
    │   └── feature_flags.js  # Feature toggles
    ├── registry.js           # Plan extractor lookup
    └── utils.js              # Plan extraction helpers
```

**When to Work Here**:
- ✅ Adding new extractable fields
- ✅ Creating new extraction modules
- ✅ Fixing parsing bugs

**DO NOT Work Here For**:
- ❌ Navigation logic (→ bot's runFlow.js)
- ❌ Changing selectors (→ `/src/providers/`)

---

### 🔌 /src/providers/ - Provider Configuration
**Location**: `/src/providers/`  
**Context File**: `/src/providers/FOLDER_CONTEXT.md`

**What's Here**: Provider-specific URLs, selectors, defaults

**Structure**:
```
providers/
└── forusall/
    ├── config.js           # URLs & selectors (SOURCE OF TRUTH)
    ├── participantMap.js   # Participant module specifications
    └── planMap.js          # Plan module specifications
```

**config.js Contains**:
- Login URLs
- Upload/participant/search URLs
- All CSS selectors (auth, upload, MFA, search, etc.)
- Alternative selectors (fallbacks)
- Timeout defaults

**When to Work Here**:
- ✅ Portal HTML structure changes
- ✅ Selectors need updating
- ✅ Adding new URLs
- ✅ Portal UI changes

**CRITICAL**: This is the ONLY place to update selectors!

**DO NOT Work Here For**:
- ❌ Bot logic (→ `/src/bots/`)
- ❌ Extraction logic (→ `/src/extractors/`)

---

### 🔐 /src/middleware/ - Express Middleware
**Location**: `/src/middleware/`  
**Context File**: `/src/middleware/FOLDER_CONTEXT.md`

**What's Here**: Express middleware (currently only auth)

**Files**:
- **`auth.js`** - Token-based authentication
  - `requireUser` - Requires any authenticated user
  - `requireAdmin` - Requires admin role
  - `resolveRole()` - Check token role
  - `listUsersPublic()` - Get user list

**Token Storage**: `tokens.json` (gitignored, loaded at startup)

**When to Work Here**:
- ✅ Adding authentication methods
- ✅ Implementing new role types
- ✅ Changing token validation

**DO NOT Work Here For**:
- ❌ Changing tokens.json structure (maintain backward compatibility)
- ❌ Bot logic (→ `/src/bots/`)

---

### 🛣️ /src/routes/ - API Routes
**Location**: `/src/routes/`  
**Context File**: `/src/routes/FOLDER_CONTEXT.md`

**What's Here**: HTTP API route definitions

**Key Files**:
- **`index.js`** - Main router (mounts all sub-routers)
  - Core endpoints: /health, /status, /jobs, /locks, /settings, /metrics
  - Bot mounts
  - Admin endpoints
  
- **`admin-auth.js`** - Admin authentication (login/logout/whoami)
- **`admin-jobs-db.js`** - Admin job database queries
- **`admin-metrics-db.js`** - Admin metrics from DB
- **`data-jobs-db.js`** - User job queries
- **`data-metrics-db.js`** - User metrics
- **`articles-files.js`** - Knowledge base API
- **`articles-draft.js`** - Draft articles API

**When to Work Here**:
- ✅ Adding new API endpoints
- ✅ Changing request/response formats
- ✅ Modifying route middleware

**DO NOT Work Here For**:
- ❌ Bot implementation (→ `/src/bots/`)
- ❌ Queue logic (→ `/src/engine/queue.js`)

---

### 📚 /docs/ - Documentation Website
**Location**: `/docs/`  
**Context File**: `/docs/FOLDER_CONTEXT.md`

**What's Here**: Complete static documentation website

**Structure**:
- **`index.html`** - Documentation home
- **`openapi.yaml`** - API specification (SOURCE OF TRUTH)
- **`api/`** - API reference (EN/ES)
- **`sandbox/`** - Interactive testing UI (EN/ES)
- **`admin/`** - Admin console (dashboard, jobs, metrics)
- **`data/`** - Data console (non-admin)
- **`evidence/`** - Evidence browser
- **`knowledge-database/`** - Internal knowledge base
  - `Articles/` - Published articles (JSON)
  - `Articles_Draft/` - Draft articles
  - `Js/`, `Css/`, `Images/` - KB assets

**When to Work Here**:
- ✅ Updating API documentation
- ✅ Adding sandbox features
- ✅ Improving admin console
- ✅ Creating knowledge base articles

**DO NOT Work Here For**:
- ❌ Backend changes (→ `/src/`)
- ❌ API implementation (→ `/src/routes/`)

**IMPORTANT**: Always update `openapi.yaml` BEFORE updating HTML docs!

---

### 💾 /migrations/ - Database Migrations
**Location**: `/migrations/`  
**Context File**: `/migrations/FOLDER_CONTEXT.md`

**What's Here**: PostgreSQL migration scripts (sequential, numbered)

**Files**:
1. **`001_init.sql`** - Initial schema (jobs, job_stages tables)
2. **`002_views.sql`** - Analytical views
3. **`003_alias_views.sql`** - Compatibility aliases
4. **`004_reset_schema.sql`** - Reset script (DEV ONLY)
5. **`005_ms_durations.sql`** - Millisecond precision
6. **`006_job_stages_dedupe.sql`** - Deduplication fix

**When to Work Here**:
- ✅ Adding new tables/columns
- ✅ Creating indexes
- ✅ Modifying views

**DO NOT Work Here For**:
- ❌ Application logic (→ `/src/`)
- ❌ In-memory queue (→ `/src/engine/queue.js`)

**CRITICAL**: Always test migrations on copy of production data!

---

### 🔧 /scripts/ - Utility Scripts
**Location**: `/scripts/`  
**Context File**: `/scripts/FOLDER_CONTEXT.md`

**What's Here**: Operational scripts for health, validation, maintenance

**Files**:
- **`healthcheck.sh`** - Docker health check
- **`audit-smoke.js`** - Database smoke test
- **`validate-jobs.mjs`** - Job data validation
- **`validate-jobs-deep.mjs`** - Deep validation with DB cross-checks

**When to Work Here**:
- ✅ Adding operational tools
- ✅ Creating validation scripts
- ✅ Building maintenance utilities

**DO NOT Work Here For**:
- ❌ Bot logic (→ `/src/bots/`)
- ❌ Core infrastructure (→ `/src/engine/`)

---

### 📋 /examples/ - Integration Examples
**Location**: `/examples/`  
**Context File**: `/examples/FOLDER_CONTEXT.md`

**What's Here**: Example integrations and usage patterns

**Files**:
- **`curl.sh`** - Shell script with curl examples
- **`forus-bot-n8n.json`** - n8n workflow template

**When to Work Here**:
- ✅ Adding integration examples
- ✅ Creating SDK templates
- ✅ Documenting common patterns

**DO NOT Work Here For**:
- ❌ Production code (→ `/src/`)
- ❌ Tests (→ test directories in `/src/`)

---

### 🧪 /forusall-portal-html-data/ - Test Fixtures
**Location**: `/forusall-portal-html-data/`  
**Context File**: `/forusall-portal-html-data/FOLDER_CONTEXT.md`

**What's Here**: Saved HTML snapshots from ForUsAll portal

**Structure**:
```
forusall-portal-html-data/
└── plans data/
    ├── Sample1.html    # Plan setup page
    └── Sample2.html    # Alternative view
```

**Purpose**:
- Selector development & testing
- Extractor development (offline)
- Debugging (compare HTML changes)
- Testing without portal access
- Onboarding reference

**When to Work Here**:
- ✅ Portal structure changes (save new snapshot)
- ✅ Need more test examples
- ✅ Adding new portal module snapshots

**DO NOT Work Here For**:
- ❌ Editing HTML content (read-only references)
- ❌ Bot implementation (→ `/src/bots/`)

**CRITICAL**: Always sanitize sensitive data before committing!

---

## 🧭 Quick Navigation Guide

### "I need to..."

#### Add a New Bot
1. Read `/src/bots/FOLDER_CONTEXT.md`
2. Create new folder in `/src/bots/`
3. Add routes.js, controller.js, runFlow.js
4. Register in `/src/routes/index.js`

#### Update Portal Selectors
1. Read `/src/providers/FOLDER_CONTEXT.md`
2. Modify `/src/providers/forusall/config.js`
3. Test with HTML fixtures in `/forusall-portal-html-data/`

#### Add a Utility Function
1. Read `/src/engine/utils/FOLDER_CONTEXT.md`
2. Add to appropriate file in `/src/engine/utils/`
3. Export function
4. Use in bots

#### Create a Data Extractor
1. Read `/src/extractors/FOLDER_CONTEXT.md`
2. Add module file in `/src/extractors/forusall-participant/modules/`
3. Register in `registry.js`
4. Test with HTML fixtures

#### Update API Documentation
1. Read `/docs/FOLDER_CONTEXT.md`
2. Update `/docs/openapi.yaml` FIRST
3. Update HTML docs in `/docs/api/`
4. Update sandbox if needed

#### Add Database Schema
1. Read `/migrations/FOLDER_CONTEXT.md`
2. Create new migration file (sequential number)
3. Test on copy of production data
4. Apply migration

#### Debug Selector Issues
1. Check `/forusall-portal-html-data/` for HTML fixtures
2. Compare with live portal
3. Update `/src/providers/forusall/config.js`
4. Test with bot

---

## 🎯 AI Agent Workflow

### Step 1: Read This File (PROJECT_STRUCTURE.md)
**Get oriented**: Understand where everything is

### Step 2: Identify Target Folder(s)
**Use the quick nav guide** above to find relevant folders

### Step 3: Read Specific FOLDER_CONTEXT.md
**Dive deep**: Read context file for folder you'll work in

### Step 4: Implement Changes
**Follow patterns**: Use examples from context file

### Step 5: Test
**Follow testing guidance**: From folder context file

---

## 📌 Critical Rules

### ALWAYS Read Context Files First
1. Read `PROJECT_STRUCTURE.md` (this file) for overview
2. Read specific `FOLDER_CONTEXT.md` before touching any folder
3. Never assume you know project structure

### NEVER Modify Without Context
- Don't change files without reading folder context
- Don't add code without checking for existing utilities
- Don't duplicate functionality

### Respect Boundaries
- Selectors ONLY in `/src/providers/forusall/config.js`
- Bot logic ONLY in `/src/bots/`
- Utilities ONLY in `/src/engine/utils/`
- Extractors ONLY in `/src/extractors/`

### Security
- Never commit credentials
- Never log sensitive data
- Sanitize HTML fixtures before committing
- Keep `tokens.json` gitignored

---

## 📊 Project Statistics

- **Total Folders**: 14 major directories
- **Context Files**: 14 comprehensive guides
- **Bots**: 7 automation bots
- **Extractors**: 12 data extraction modules (6 participant + 6 plan)
- **Utilities**: 5 reusable helpers
- **Documentation**: Multi-language (EN/ES)
- **Lines of Code**: ~20,000+ (excluding node_modules)

---

## 🔗 Related Files

- **`.cursor/rules/rules.mdc`** - Comprehensive development rules
- **`CONTEXT_FILES_SUMMARY.md`** - Summary of all context files
- **`README.md`** - Project overview
- **`/docs/openapi.yaml`** - API specification

---

**Last Updated**: 2025-01-15  
**Version**: 2.3.0  
**Maintained By**: ForUsBots Team

