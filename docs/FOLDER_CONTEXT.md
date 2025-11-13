# /docs/ - Documentation Website Context

## Purpose
This directory contains the complete static documentation website for ForUsBots. It includes API reference documentation (English and Spanish), admin console, sandbox UI for testing, and an internal knowledge database.

## Architecture
```
docs/
├── index.html              # Documentation home page
├── styles.css              # Global styles
├── images/                 # Images and icons
├── openapi.yaml            # OpenAPI 2.2.0 specification (source of truth)
├── api/                    # API reference documentation
│   ├── index.html          # English API docs
│   ├── es/                 # Spanish API docs
│   │   └── index.html
│   └── styles.css
├── sandbox/                # Interactive API testing UI
│   ├── index.html          # English sandbox
│   ├── es/                 # Spanish sandbox
│   │   └── index.html
│   ├── js/                 # Sandbox JavaScript
│   └── sandbox.css
├── admin/                  # Admin console
│   ├── index.html          # Console UI
│   ├── js/                 # Console JavaScript
│   └── styles.css
├── data/                   # Data console (non-admin)
│   ├── index.html
│   ├── js/
│   └── styles.css
├── evidence/               # Evidence browser UI
│   ├── index.html
│   └── styles.css
└── knowledge-database/     # Internal knowledge base
    ├── index.html          # KB home
    ├── article.html        # Article viewer
    ├── builder.html        # Article builder (admin)
    ├── Articles/           # Published articles (JSON)
    ├── Articles_Draft/     # Draft articles (JSON)
    ├── Js/                 # KB JavaScript
    ├── Css/                # KB styles
    └── Images/             # KB images + people profiles
```

## Key Sections

### API Reference (`/api/`)
**Purpose**: Complete REST API documentation for developers.

**Features**:
- All endpoints documented with request/response examples
- Available in English (`/api/`) and Spanish (`/api/es/`)
- Static HTML (no "Try it out" buttons)
- Links to sandbox for live testing
- Organized by endpoint categories (jobs, upload, scrape, admin)

**When to update**: When adding new endpoints, changing request/response formats, or updating API behavior.

---

### Sandbox UI (`/sandbox/`)
**Purpose**: Interactive API testing environment.

**Features**:
- Form-based endpoint testing (upload, scrape, search, MFA reset)
- Dry-run mode (validates without executing)
- Code snippet generation (curl, JavaScript fetch)
- Token masking in examples (`****...last4`)
- Available in English and Spanish

**Key Files**:
- `js/core/ui.js`: Main UI logic
- `js/core/validate.js`: Input validation
- `js/core/snippets.js`: Code generation
- `js/endpoints/*.js`: Endpoint-specific handlers

**When to update**: When adding new bot endpoints or changing input schemas.

---

### Admin Console (`/admin/`)
**Purpose**: Administrative dashboard for monitoring and managing the service.

**Features**:
- **KPIs**: Time spent, Jobs count, Top Job, Max Concurrency
- **Jobs Table**: Recent jobs with status, created by, duration
- **Metrics Chart**: Average duration by bot (fixed Y-axis 0..20s)
- **Settings**: Adjust max concurrency, toggle flags
- **Actions**: Purge jobs DB, close shared context
- **Manual refresh only** (no auto-polling to reduce server load)

**Key Files**:
- `index.html`: Main console UI
- `js/main.js`: Console initialization
- `js/admin-api.js`: API calls
- `js/components/*.js`: Jobs, metrics, settings components
- `js/lib/chart.js`: Chart.js library

**Authentication**: Cookie-based (`forusbot_admin`), requires admin token.

**When to update**: When adding admin features, new metrics, or dashboard improvements.

---

### Data Console (`/data/`)
**Purpose**: Similar to admin console but with limited permissions (for non-admin users).

**Features**:
- View jobs (may be filtered to own jobs)
- View basic metrics
- No settings or purge actions

**When to update**: When adding user-facing data views.

---

### Evidence Browser (`/evidence/`)
**Purpose**: Browse and view evidence screenshots.

**Features**:
- Directory listing of `/tmp/evidence` (served by Express + serve-index)
- Protected by authentication (configurable: public, user-only, admin-only)
- Cookie-based login (`forusbot_token`)

**When to update**: Rarely (uses serve-index middleware).

---

### Knowledge Database (`/knowledge-database/`)
**Purpose**: Internal knowledge base for team documentation, procedures, and guides.

**Features**:
- **Article System**: JSON-based articles with rich content blocks
- **Search**: Full-text search across articles
- **Categories**: Organize articles by topic
- **Authors**: Attribution with profile images
- **Builder**: Visual article editor (admin only)
- **Draft System**: Save drafts before publishing

**Article Format** (JSON):
```json
{
  "id": "general_participant_handling",
  "title": "Handling Participant Updates",
  "author": "Ivan Alvis",
  "category": "Procedures",
  "lastUpdated": "2025-01-15",
  "blocks": [
    { "type": "heading", "content": "Overview", "level": 2 },
    { "type": "paragraph", "content": "This guide explains..." },
    { "type": "code", "language": "javascript", "content": "const example = ..." }
  ]
}
```

**Key Files**:
- `index.html`: KB home with search
- `article.html`: Article viewer
- `builder.html`: Article builder (admin)
- `Js/articleScript.js`: Article rendering
- `Js/searchComponent.js`: Search functionality
- `Js/builder/*.js`: Builder components
- `Articles/*.json`: Published articles
- `Articles_Draft/*.json`: Draft articles

**When to update**:
- Adding new articles (via builder or API)
- Updating article schemas
- Adding new block types
- Improving search

---

### OpenAPI Specification (`openapi.yaml`)
**Purpose**: Machine-readable API specification (version 2.3.0).

**Features**:
- Complete endpoint definitions
- Request/response schemas
- Authentication requirements
- Examples for all endpoints
- Source of truth for API documentation

**When to update**: **ALWAYS** update when changing API (before updating HTML docs).

---

## When to Work Here

### Modify Documentation When:
- API endpoints added/changed
- Request/response formats updated
- New features added
- Bot behavior changes
- Error codes/messages change

### Update Sandbox When:
- New bot endpoints added
- Input schemas change
- Adding new example scenarios
- Improving validation

### Update Admin Console When:
- Adding new admin features
- New metrics/KPIs
- Dashboard improvements
- Settings changes

### Update Knowledge Base When:
- Creating internal procedures
- Documenting best practices
- Adding troubleshooting guides
- Team knowledge sharing

### DO NOT Modify When:
- Implementing bot logic (use `/src/bots/`)
- Changing backend behavior (use `/src/`)
- Only need to restart services (no doc changes)

---

## Internationalization (i18n)

### Supported Languages
- **English** (primary)
- **Spanish** (full support)

### Translation Locations
- API docs: `/api/` (EN), `/api/es/` (ES)
- Sandbox: `/sandbox/` (EN), `/sandbox/es/` (ES)

### Translation Guidelines
- Keep technical terms consistent
- Translate UI labels, descriptions, examples
- Keep code snippets in English (with Spanish comments)
- Update both versions simultaneously

---

## Static Asset Management

### Images
- **Location**: `/docs/images/`
- **Profile photos**: `/docs/knowledge-database/Images/people/`
- **Naming**: Use descriptive names, lowercase with underscores

### Styles
- **Global styles**: `/docs/styles.css`
- **Section-specific**: Each major section has own styles.css
- **KB styles**: `/docs/knowledge-database/Css/`

### Scripts
- **Vanilla JavaScript** (no framework dependencies)
- **Modular organization** (core, components, endpoints)
- **No build step** (serve directly)

---

## Deployment

### Static Serving
- Served by Express via `express.static()`
- No build process required
- Direct file serving from `/docs/`

### Cache Control
- Admin/data consoles: No cache (`no-cache, no-store`)
- Static docs: Standard browser caching
- OpenAPI: No cache (for freshness)

### Security
- Admin console: Cookie-based auth (`forusbot_admin`)
- Evidence: Configurable auth (public/user/admin)
- Knowledge base: No auth (internal team use)
- Sandbox: No auth (safe dry-run only)

---

## Testing Documentation

### Manual Testing
- Check all links work
- Test forms in sandbox
- Verify code examples are correct
- Test in multiple browsers
- Test responsive design (mobile, tablet)

### Automated Testing
- Link checker (detect 404s)
- Schema validation (OpenAPI)
- Screenshot comparison (visual regression)

### Code Examples
- Test all curl examples against real API
- Test JavaScript fetch examples in browser console
- Ensure examples use valid tokens (masked in docs)

---

## Best Practices

### Documentation Writing
- Be concise and clear
- Use examples liberally
- Include error cases
- Link to related sections
- Keep consistent terminology

### Code Snippets
- Always include comments
- Show complete examples (not fragments)
- Include error handling
- Mask sensitive data (tokens, credentials)

### Maintenance
- Update docs before releasing features
- Keep OpenAPI spec synchronized with code
- Review docs quarterly for accuracy
- Archive outdated content

---

## Dependencies

### JavaScript Libraries
- **Chart.js** (v4.4.7): For admin console charts
- **No other external dependencies** (pure vanilla JS)

### Fonts
- System fonts (no web fonts)

### Icons
- Local image files (no icon fonts or SVG sprites)

---

## Future Enhancements
- **OpenAPI UI**: Auto-generate docs from openapi.yaml
- **API changelog**: Track API version changes
- **Video tutorials**: Embed demos
- **Interactive examples**: Run code in browser
- **Dark mode**: Theme switcher
- **PDF export**: Generate PDF docs from HTML
- **Versioned docs**: Support multiple API versions

