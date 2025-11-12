# /src/middleware/ - Express Middleware Context

## Purpose
This directory contains Express middleware functions used across all API routes. Currently focused on authentication and authorization.

## Key Files

### `auth.js`
**Purpose**: Token-based authentication and role-based authorization middleware. Loads user/admin tokens from `tokens.json` and validates requests.

**Architecture**:
- Tokens loaded from JSON file (configurable path via ENV)
- Supports multiple roles: `admin`, `user`, custom roles (e.g., `hr_lead`)
- Includes user metadata (name, email, id) in req.auth
- No database dependency (file-based for simplicity)

**Exported Functions**:

#### 1. `requireUser` (default export)
```javascript
const requireUser = require('../middleware/auth');

// Usage in routes:
router.get('/jobs', requireUser, (req, res) => {
  // req.auth.role available ('admin', 'user', etc.)
  // req.auth.isAdmin boolean
  // req.auth.user object { name, email, id }
});
```
**Behavior**: Requires any authenticated user (any role). Returns 401 if no valid token.

#### 2. `requireAdmin`
```javascript
const { requireAdmin } = require('../middleware/auth');

// Usage in routes:
router.get('/settings', requireAdmin, (req, res) => {
  // Only admin tokens pass
});
```
**Behavior**: Requires `role: "admin"`. Returns 401 if no token, 403 if token is not admin.

#### 3. `resolveRole(token)`
```javascript
const { resolveRole } = require('../middleware/auth');

const role = resolveRole(token);
// Returns: 'admin', 'user', 'hr_lead', etc. or null if invalid
```
**Behavior**: Utility function to check token role without middleware. Used in server.js for cookie-based auth and conditional route protection.

#### 4. `listUsersPublic()`
```javascript
const { listUsersPublic } = require('../middleware/auth');

const users = listUsersPublic();
// Returns: [{ id, name, email, role, img }, ...]
```
**Behavior**: Returns sanitized user list (for displaying in UIs like knowledge base author attribution). Includes profile image path.

---

## Token Format (`tokens.json`)

### Array Format
```json
[
  {
    "token": "admin_secret_token_here",
    "role": "admin",
    "name": "Ivan Alvis",
    "email": "ivan@example.com",
    "id": "ivan_alvis"
  },
  {
    "token": "user_secret_token_here",
    "role": "user",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "id": "jane_doe"
  }
]
```

### Object Format
```json
{
  "admin_secret_token_here": {
    "role": "admin",
    "name": "Ivan Alvis",
    "email": "ivan@example.com",
    "id": "ivan_alvis"
  },
  "user_secret_token_here": {
    "role": "user",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "id": "jane_doe"
  }
}
```

Both formats supported. Loaded from:
1. `TOKENS_FILE` ENV var (absolute or relative path)
2. Default: `/etc/secrets/tokens.json` (production) or `./tokens.json` (dev)

---

## Authentication Flow

### HTTP Header
```bash
curl -H "x-auth-token: YOUR_TOKEN" https://api/forusbot/jobs
```

### Bearer Token (Alternative)
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" https://api/forusbot/jobs
```

### Cookie-Based (Admin Console)
- Admin console uses `forusbot_admin` cookie
- Evidence browser uses `forusbot_token` cookie
- server.js injects cookie value into `x-auth-token` header

---

## When to Work Here

### Modify Middleware When:
- Adding new authentication methods (OAuth, JWT, API keys)
- Implementing new role types
- Adding permission checks beyond role
- Changing token validation logic
- Adding request logging/audit trail

### Add New Middleware When:
- Rate limiting
- Request validation
- CORS configuration
- Request logging
- Error normalization

### DO NOT Modify When:
- Changing bot logic (use `/src/bots/`)
- Adding routes (use `/src/routes/`)
- Modifying tokens.json structure (ensure backward compatibility)

---

## Best Practices

### Security
- **Never commit** `tokens.json` (must be in .gitignore)
- **Never log** tokens in plaintext
- Use secure random tokens (≥32 characters, crypto.randomBytes)
- Rotate tokens regularly
- Use HTTPS in production
- Consider token expiration for long-lived deployments

### Token Generation
```bash
# Generate secure token
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Role Design
- Keep roles simple: `admin`, `user`, domain-specific (e.g., `hr_lead`, `payroll_admin`)
- Use role hierarchy if needed (admin can do everything user can do)
- Document role permissions in .cursorrules or API docs

### Error Responses
```javascript
// 401 Unauthorized (no token or invalid token)
{ ok: false, error: 'unauthorized', warnings: [] }

// 403 Forbidden (valid token but insufficient permissions)
{ ok: false, error: 'forbidden', warnings: [] }
```

---

## Testing

### Unit Tests
- Test token validation with valid/invalid tokens
- Test role-based access (admin, user, unknown roles)
- Test token file loading (array format, object format, missing file)
- Test metadata extraction (name, email, id)
- Test public user list sanitization

### Integration Tests
- Test protected routes return 401 without token
- Test admin routes return 403 for non-admin tokens
- Test req.auth object populated correctly
- Test multiple authentication methods (header, bearer, cookie)

### Mock Tokens
```javascript
// Test tokens.json
{
  "test_admin_token": { "role": "admin", "name": "Test Admin", "email": "admin@test.com" },
  "test_user_token": { "role": "user", "name": "Test User", "email": "user@test.com" }
}
```

---

## Environment Variables

### Token File Location
- `TOKENS_FILE`: Custom path to tokens.json (optional)
- `TOKENS_FILENAME`: Custom filename (default: `tokens.json`)
- `NODE_ENV`: Affects default search paths (production vs development)

### Search Order
1. `TOKENS_FILE` (if set)
2. `/etc/secrets/tokens.json` (if `NODE_ENV=production`)
3. `./tokens.json` (project root)
4. `./src/tokens.json`

---

## Dependencies
- None (pure Node.js)
- Used by: all routes in `/src/routes/`, bot controllers

---

## Future Enhancements
- **Database-backed tokens**: Store in PostgreSQL for dynamic management
- **Token expiration**: Add expiry timestamps
- **Refresh tokens**: Implement token rotation
- **OAuth integration**: Support external identity providers
- **Permission granularity**: Beyond roles (e.g., per-bot permissions)
- **Rate limiting**: Per-token request limits
- **Audit logging**: Track token usage (who, when, what)

