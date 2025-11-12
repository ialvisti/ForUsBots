# /scripts/ - Utility Scripts Context

## Purpose
This directory contains utility scripts for health checks, validation, and maintenance tasks. These scripts are used for monitoring, testing, and operational tasks.

## Available Scripts

### `healthcheck.sh`
**Purpose**: Docker/Kubernetes health check script.

**Usage**:
```bash
bash scripts/healthcheck.sh
# Exit 0 if healthy, 1 if unhealthy
```

**Behavior**:
- Curls `http://localhost:$PORT/health` (defaults to 10000)
- Checks for HTTP 200 status
- Parses JSON response for `ok: true`
- Used by Docker HEALTHCHECK directive

**When to use**: Automatic health monitoring in containerized deployments.

**Exit Codes**:
- `0`: Service healthy
- `1`: Service unhealthy or unreachable

---

### `audit-smoke.js`
**Purpose**: Smoke test for audit database functionality.

**Usage**:
```bash
node scripts/audit-smoke.js
```

**Tests**:
- Database connection
- Table existence (jobs, job_stages)
- View existence (job_metrics_by_bot, recent_jobs)
- Basic CRUD operations
- Foreign key constraints
- JSONB field operations

**When to use**:
- After applying migrations
- After database configuration changes
- Debugging audit issues
- CI/CD pipeline validation

**Requirements**:
- `AUDIT_DB=1` environment variable
- `DATABASE_URL` configured
- Migrations applied

---

### `validate-jobs.mjs`
**Purpose**: Validate job data structure and integrity (ESM module).

**Usage**:
```bash
node scripts/validate-jobs.mjs
```

**Validations**:
- Job ID format (UUID)
- State values (queued, running, succeeded, failed, canceled)
- Timestamp consistency (accepted < started < finished)
- Meta structure
- Result envelope format
- createdBy attribution
- Stage structure

**When to use**:
- After major queue refactors
- Debugging data corruption
- Pre-deployment validation
- CI/CD pipeline

**Output**:
- Prints validation errors
- Exit 0 if all valid, 1 if errors found

---

### `validate-jobs-deep.mjs`
**Purpose**: Deep validation with database cross-checks (ESM module).

**Usage**:
```bash
node scripts/validate-jobs-deep.mjs
```

**Validations**:
- All validations from `validate-jobs.mjs`
- Cross-check in-memory queue vs database
- Stage count consistency
- Duration calculations
- Result normalization
- Orphaned stages (stages without parent job)

**When to use**:
- Quarterly audit checks
- After database migrations
- Investigating discrepancies between memory and DB
- Performance profiling

**Requirements**:
- `AUDIT_DB=1`
- `DATABASE_URL` configured
- Service running (accesses in-memory queue)

---

## When to Work Here

### Add New Script When:
- Need operational maintenance task
- Creating deployment automation
- Adding monitoring checks
- Building data validation tools
- Creating backup/restore utilities

### Modify Existing Script When:
- Health check criteria change
- Validation rules update
- Database schema changes
- New job states added

### DO NOT Create Scripts For:
- Bot-specific logic (use `/src/bots/`)
- Core infrastructure (use `/src/engine/`)
- One-time manual tasks (use terminal directly)

---

## Script Patterns

### Health Check Pattern
```bash
#!/bin/bash
set -e

PORT=${PORT:-10000}
RESPONSE=$(curl -sf "http://localhost:$PORT/health" || exit 1)
echo "$RESPONSE" | grep -q '"ok":true' || exit 1
exit 0
```

### Node.js Validation Pattern
```javascript
#!/usr/bin/env node
const { validate } = require('./validators');

async function main() {
  const errors = await validate();
  if (errors.length > 0) {
    console.error('Validation failed:', errors);
    process.exit(1);
  }
  console.log('✓ All validations passed');
  process.exit(0);
}

main().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
```

### Database Query Pattern
```javascript
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}
```

---

## Best Practices

### Script Design
- Use descriptive names
- Include shebang line (`#!/usr/bin/env node` or `#!/bin/bash`)
- Make scripts executable (`chmod +x`)
- Exit with meaningful codes (0=success, 1=error)
- Print clear error messages
- Handle signals (SIGINT, SIGTERM)

### Error Handling
- Always use `set -e` in bash scripts
- Wrap async operations in try/catch
- Log errors before exiting
- Provide actionable error messages

### Documentation
- Add comment header explaining purpose
- Document required environment variables
- Include usage examples
- List exit codes

### Testing
- Test success case
- Test failure cases
- Test with missing ENV vars
- Test with invalid data

---

## Environment Variables

### Common Variables
- `PORT`: Service port (default 10000)
- `DATABASE_URL`: PostgreSQL connection string
- `AUDIT_DB`: Enable audit database (1 or 0)
- `NODE_ENV`: Environment (production, development, test)

### Script-Specific
- `HEALTH_CHECK_TIMEOUT`: Timeout for health checks (seconds)
- `VALIDATION_STRICT`: Fail on warnings (1 or 0)

---

## Execution Contexts

### Docker Container
- Health check runs inside container
- Access to localhost:$PORT
- No network access to external services (unless needed)

### CI/CD Pipeline
- Validation scripts run in CI
- Access to test database
- May need service running in background

### Local Development
- Scripts run on developer machine
- Access to local services
- May need different ENV vars

### Production
- Only health check runs automatically
- Validation scripts run manually
- Audit scripts scheduled via cron/scheduler

---

## Exit Codes

### Standard Exit Codes
- `0`: Success
- `1`: General error
- `2`: Misuse of command
- `126`: Command not executable
- `127`: Command not found
- `130`: Terminated by Ctrl+C

### Custom Exit Codes (if needed)
- `10`: Validation failed
- `11`: Database unreachable
- `12`: Configuration error

---

## Integration

### Docker Healthcheck
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD bash scripts/healthcheck.sh || exit 1
```

### GitHub Actions
```yaml
- name: Validate Jobs
  run: node scripts/validate-jobs.mjs
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    AUDIT_DB: 1
```

### Cron Job
```cron
# Daily deep validation at 3 AM
0 3 * * * cd /app && node scripts/validate-jobs-deep.mjs >> /var/log/validation.log 2>&1
```

---

## Dependencies

### Bash Scripts
- `curl`: HTTP client
- `jq`: JSON parsing (optional)
- `bash` 4.0+

### Node.js Scripts
- `pg`: PostgreSQL client (if accessing DB)
- Project dependencies (if importing from `/src/`)

---

## Testing Scripts

### Manual Testing
```bash
# Test health check
bash scripts/healthcheck.sh
echo $?  # Should be 0

# Test validation
node scripts/validate-jobs.mjs
echo $?  # Should be 0

# Test with errors
DATABASE_URL=invalid node scripts/audit-smoke.js
echo $?  # Should be 1
```

### Automated Testing
- Include scripts in CI/CD pipeline
- Test against fixture data
- Mock database connections when appropriate

---

## Future Scripts (Ideas)
- `backup-db.sh`: Database backup automation
- `restore-db.sh`: Database restore from backup
- `rotate-logs.sh`: Log rotation and archiving
- `cleanup-sessions.sh`: Clean old session files
- `migrate-db.js`: Apply pending migrations
- `seed-db.js`: Load sample data for testing
- `benchmark.js`: Performance benchmarking
- `generate-tokens.js`: Generate secure tokens
- `export-metrics.js`: Export metrics to CSV/JSON
- `purge-old-jobs.js`: Clean up old completed jobs

