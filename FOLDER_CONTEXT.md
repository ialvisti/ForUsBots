# ForUsBots - Root Directory Context

## Purpose
This is the root directory of the ForUsBots automation service. It contains the main configuration files, entry points, and top-level documentation for the entire project.

## Key Files

### Configuration Files
- **`package.json`**: Node.js project manifest. Defines dependencies (Express, Playwright, PostgreSQL client, etc.), scripts (`start`, `dev`), and project metadata.
- **`package-lock.json`**: Locked dependency versions for reproducible builds.
- **`.gitignore`**: Specifies intentionally untracked files (node_modules, .env, tokens.json, .sessions, .user-data).
- **`.cursorrules`**: Comprehensive AI development rules and guidelines for maintaining code consistency.
- **`Dockerfile`**: Container definition using Playwright base image (mcr.microsoft.com/playwright:v1.54.2-jammy). Runs as non-root user `pwuser`.
- **`render.yaml`**: Render.com deployment configuration.

### Documentation
- **`README.md`**: Project overview, endpoints summary, quickstart guide, and changelog.
- **`presentation.pdf`**: Project presentation materials.

### Security
- **`tokens.json`**: (gitignored) Token registry for authentication. Contains user/admin tokens with roles and metadata.

## Subdirectories

### `/src/`
Core application source code. Contains bots, engine, extractors, providers, middleware, routes, and entry points.

### `/docs/`
Static documentation website (HTML/CSS/JS). Includes API reference (EN/ES), admin console, sandbox UI, and knowledge database.

### `/migrations/`
PostgreSQL migration scripts for audit database schema.

### `/scripts/`
Utility scripts for health checks, validation, and maintenance.

### `/examples/`
Example integrations (curl scripts, n8n workflows).

### `/forusall-portal-html-data/`
Sample HTML data from the ForUsAll portal for testing/reference.

## When to Work Here
- **Modify this directory when:**
  - Adding/removing npm dependencies
  - Updating Docker configuration
  - Changing deployment settings
  - Updating root-level documentation
  - Modifying gitignore rules

- **DO NOT modify when:**
  - Implementing bot logic (use `/src/bots/`)
  - Adding utilities (use `/src/engine/utils/`)
  - Updating API routes (use `/src/routes/`)
  - Changing selectors/config (use `/src/providers/`)

## Environment Variables
All runtime configuration is sourced from environment variables (see `.cursorrules` for full list). Never hardcode credentials in this directory.

## Critical Files to Preserve
- `tokens.json` (never commit, must be in .gitignore)
- `.env` (never commit, must be in .gitignore)
- `.sessions/` (never commit, runtime session storage)

