# /src/ - Source Code Root Context

## Purpose
This directory contains all application source code for the ForUsBots automation service. It's organized into logical modules for bots, engine infrastructure, extractors, providers, middleware, and routes.

## Architecture Overview
```
src/
├── bots/          # Individual automation bots (each has routes, controller, runFlow)
├── engine/        # Core infrastructure (auth, queue, browser, logging, utils)
├── extractors/    # Data extraction modules for participant pages
├── providers/     # Provider-specific configuration (URLs, selectors)
├── middleware/    # Express middleware (authentication)
├── routes/        # API route definitions
├── config.js      # Environment variable configuration
├── server.js      # Express app setup
└── index.js       # Entry point (HTTP server + signal handlers)
```

## Key Files

### Entry Points
- **`index.js`**: Main entry point. Starts HTTP server, installs signal handlers (SIGINT, SIGTERM, SIGUSR2), and manages graceful shutdown.
- **`server.js`**: Express application setup. Configures middleware, static routes, bot routes, and error handlers.
- **`config.js`**: Centralized configuration loader. Exports ENV-based settings (SITE_USER, SITE_PASS, TOTP_SECRET, MAX_CONCURRENCY, etc.).

## Subdirectories

### `/src/bots/`
**Purpose**: Individual automation bots (upload, scrape, MFA reset, search, email trigger, update participant).
**Standard Structure**: Each bot has `routes.js`, `controller.js`, `runFlow.js`.
**When to use**: Implementing new bots or modifying existing bot logic.

### `/src/engine/`
**Purpose**: Core automation infrastructure shared by all bots.
**Contains**: Authentication, browser management, job queue, logging, sessions, evidence, utilities.
**When to use**: Modifying core functionality, adding utilities, changing auth logic, queue behavior, or logging.

### `/src/extractors/`
**Purpose**: Data extraction modules for parsing participant pages (census, loans, payroll, plan details, savings rate, MFA).
**When to use**: Adding new extractable fields, creating new extraction modules, or improving parsing logic.

### `/src/providers/`
**Purpose**: Provider-specific configuration (ForUsAll URLs, selectors, defaults).
**When to use**: Updating portal URLs, adding/modifying selectors, changing provider-specific settings.

### `/src/middleware/`
**Purpose**: Express middleware (authentication, authorization).
**When to use**: Modifying auth logic, token validation, role-based access control.

### `/src/routes/`
**Purpose**: API route definitions (jobs, status, admin endpoints, bot mounts).
**When to use**: Adding new API endpoints, modifying route handlers, changing response formatting.

## Design Patterns

### Bot Pattern
All bots follow a standard 3-file structure:
1. **routes.js**: Express router, defines HTTP endpoints
2. **controller.js**: Request validation, job submission (202 pattern)
3. **runFlow.js**: Actual automation logic (async function)

### Authentication Flow
All bots use centralized `ensureAuthForTarget()` from `engine/auth/loginOtp.js` for login + OTP handling.

### Job Management
Jobs are submitted via `engine/queue.js` using the 202 pattern (accept, poll, complete).

### Page Lifecycle
All bots use `getPageFromPool()` and `releasePage()` from `engine/sharedContext.js` for resource management.

## When to Work Here
- **Modify `/src/` when:**
  - Implementing new bots
  - Adding core infrastructure features
  - Updating authentication logic
  - Modifying API endpoints
  - Adding utilities or extractors

- **DO NOT modify when:**
  - Only changing documentation (use `/docs/`)
  - Only updating database schema (use `/migrations/`)
  - Only changing deployment config (use root-level files)

## Import Conventions
- Use **CommonJS** (`require`, `module.exports`)
- Use **relative imports** within src/ (e.g., `require('../engine/queue')`)
- Keep imports at top of file
- Group imports logically (external deps, internal modules, utilities)

## Error Handling
- Always wrap Playwright operations in try/catch
- Use `normalizeError()` from `engine/logger.js`
- Return structured error responses with error codes
- Log errors with context (jobId, bot, stage)

## Testing
- Place tests adjacent to source files or in `__tests__/` subdirectories
- Use Vitest (preferred) or Jest
- Aim for ≥80% coverage on critical paths
- Mock external dependencies (Playwright, database)

## Security
- Never hardcode credentials in this directory
- Load all secrets from `config.js` (sourced from ENV)
- Never log sensitive data (passwords, OTP codes, tokens)
- Use auth middleware for all protected routes

