# /migrations/ - Database Migrations Context

## Purpose
This directory contains PostgreSQL migration scripts for the audit database. Migrations create and update the database schema used for tracking job execution, metrics, and audit trails.

## Migration Files

### `001_init.sql`
**Purpose**: Initial database schema creation.

**Creates**:
- **`jobs` table**: Core job tracking (jobId, botId, state, timestamps, meta, result)
- **`job_stages` table**: Stage-level tracking (stage name, start/end times, status, durations)
- **Indexes**: Performance indexes on jobId, botId, state, timestamps
- **Constraints**: Foreign keys, check constraints

**Key Columns**:
- `job_id` (PK): Unique job identifier (UUID)
- `bot_id`: Bot that executed job
- `state`: Job state (queued, running, succeeded, failed, canceled)
- `accepted_at`, `started_at`, `finished_at`: Lifecycle timestamps
- `meta` (JSONB): Job parameters
- `result` (JSONB): Job result
- `created_by` (JSONB): User attribution
- `error_message`: Error text if failed

---

### `002_views.sql`
**Purpose**: Create analytical views for metrics and reporting.

**Creates**:
- **`job_metrics_by_bot`**: Aggregated metrics per bot (count, avg duration, success rate)
- **`recent_jobs`**: Last 100 jobs with computed durations
- **`job_stage_summary`**: Stage-level aggregations (avg duration by stage name)

**When to use**: Querying metrics for admin console, generating reports.

---

### `003_alias_views.sql`
**Purpose**: Create alternate view names for compatibility.

**Creates**:
- Alias views with different naming conventions
- Backwards compatibility for older query code

---

### `004_reset_schema.sql`
**Purpose**: Reset/rebuild schema (development only).

**Warning**: **DROPS ALL TABLES**. Never run in production.

**Use Cases**:
- Local development reset
- Test environment cleanup
- Schema redesign

---

### `005_ms_durations.sql`
**Purpose**: Add millisecond-precision duration columns.

**Adds**:
- `duration_ms` columns to jobs and stages
- Computed columns for better precision
- Indexes for performance

**Reason**: Original schema used seconds; milliseconds provide better granularity for stage tracking.

---

### `006_job_stages_dedupe.sql`
**Purpose**: Fix duplicate stage entries.

**Problem**: Early versions could create duplicate stage records for the same job+stage combination.

**Solution**:
- Adds unique constraint on (job_id, stage_name, started_at)
- Deduplicates existing records
- Prevents future duplicates

---

## Migration Workflow

### Applying Migrations

#### Manual Application
```bash
# Apply a single migration
psql $DATABASE_URL < migrations/001_init.sql

# Apply all migrations in order
for f in migrations/*.sql; do
  echo "Applying $f..."
  psql $DATABASE_URL < "$f"
done
```

#### Automated (Future)
- Consider using migration tools (e.g., `node-pg-migrate`, `knex`)
- Track applied migrations in `migrations_log` table
- Automatic rollback support

---

### Creating New Migrations

#### Naming Convention
```
<number>_<description>.sql
```
- **Number**: Sequential (001, 002, 003, ...)
- **Description**: Short, lowercase with underscores
- **Examples**:
  - `007_add_user_table.sql`
  - `008_add_indexes_for_performance.sql`
  - `009_add_job_tags.sql`

#### Template
```sql
-- Migration: <number>_<description>
-- Purpose: <what this migration does>
-- Date: <creation date>

BEGIN;

-- Your DDL statements here
CREATE TABLE IF NOT EXISTS ...
ALTER TABLE ...
CREATE INDEX ...

COMMIT;
```

---

## When to Work Here

### Add Migration When:
- Adding new tables
- Adding/modifying columns
- Adding indexes for performance
- Changing constraints
- Creating views for new queries

### DO NOT Migrate When:
- Only changing application code (use `/src/`)
- Changing in-memory queue behavior (no DB impact)
- Updating documentation (use `/docs/`)

### Rollback Considerations
- Always write reversible migrations (if possible)
- Test migrations on copy of production data
- Keep backups before applying migrations
- Consider creating DOWN migrations (reverse changes)

---

## Database Schema Overview

### Core Tables

#### `jobs`
**Purpose**: Main job tracking table.

**Key Fields**:
- `job_id` (UUID, PK): Unique identifier
- `bot_id` (VARCHAR): Bot that ran job
- `state` (VARCHAR): queued | running | succeeded | failed | canceled
- `accepted_at`, `started_at`, `finished_at` (TIMESTAMP): Lifecycle
- `meta` (JSONB): Job parameters
- `result` (JSONB): Job result
- `created_by` (JSONB): Attribution { name, role, at }
- `error_message` (TEXT): Error if failed
- `duration_ms` (INTEGER): Computed duration

**Indexes**:
- Primary key on `job_id`
- Index on `bot_id`
- Index on `state`
- Index on `accepted_at` (DESC)
- Composite index on `(bot_id, state, accepted_at)`

---

#### `job_stages`
**Purpose**: Granular stage tracking within jobs.

**Key Fields**:
- `id` (SERIAL, PK): Auto-increment ID
- `job_id` (UUID, FK): References `jobs.job_id`
- `stage_name` (VARCHAR): Stage identifier (e.g., 'login', 'fill-form')
- `started_at`, `ended_at` (TIMESTAMP): Stage lifecycle
- `duration_ms` (INTEGER): Stage duration
- `status` (VARCHAR): succeed | fail
- `meta` (JSONB): Stage-specific metadata
- `error` (JSONB): Error details if failed

**Indexes**:
- Primary key on `id`
- Foreign key + index on `job_id`
- Index on `stage_name`
- Unique constraint on `(job_id, stage_name, started_at)`

---

### Views

#### `job_metrics_by_bot`
**Purpose**: Aggregated metrics per bot.

**Columns**:
- `bot_id`
- `total_jobs`
- `succeeded_jobs`
- `failed_jobs`
- `avg_duration_seconds`
- `success_rate` (percentage)

---

#### `recent_jobs`
**Purpose**: Latest jobs with computed fields.

**Columns**:
- All `jobs` columns
- `duration_seconds` (computed)
- `stage_count` (count of stages)

**Limit**: 100 most recent jobs

---

## Testing Migrations

### Test Checklist
- [ ] Migration runs without errors
- [ ] Indexes created successfully
- [ ] Foreign keys enforced
- [ ] Views return expected results
- [ ] Existing data preserved (if applicable)
- [ ] Rollback tested (if reversible)
- [ ] Performance acceptable (explain analyze)

### Local Testing
```bash
# Create test database
createdb forusbots_test

# Apply migrations
export DATABASE_URL="postgresql://localhost/forusbots_test"
psql $DATABASE_URL < migrations/001_init.sql
psql $DATABASE_URL < migrations/002_views.sql
# ... etc

# Verify schema
psql $DATABASE_URL -c "\dt"  # List tables
psql $DATABASE_URL -c "\di"  # List indexes
psql $DATABASE_URL -c "\dv"  # List views

# Cleanup
dropdb forusbots_test
```

---

## Best Practices

### SQL Style
- Use explicit schema names (public.jobs)
- Use IF NOT EXISTS for idempotency
- Add comments for complex logic
- Use transactions (BEGIN/COMMIT)
- Use uppercase for SQL keywords (CREATE TABLE)

### Performance
- Add indexes for foreign keys
- Index frequently filtered columns
- Use partial indexes when appropriate
- Analyze query plans (EXPLAIN ANALYZE)

### Data Types
- Use UUID for IDs (not SERIAL)
- Use TIMESTAMP WITH TIME ZONE for dates
- Use JSONB (not JSON) for metadata
- Use TEXT for variable-length strings
- Use INTEGER for durations in milliseconds

### Naming Conventions
- Tables: Plural, lowercase, underscores (`jobs`, `job_stages`)
- Columns: Lowercase, underscores (`job_id`, `created_at`)
- Indexes: `idx_<table>_<column>` (`idx_jobs_bot_id`)
- Foreign keys: `fk_<table>_<column>` (`fk_job_stages_job_id`)

---

## Environment Variables

### Database Connection
- `DATABASE_URL`: PostgreSQL connection string
  ```
  postgresql://user:pass@host:port/database
  ```
- `AUDIT_DB=1`: Enable audit database (disabled by default)

---

## Dependencies
- **PostgreSQL 12+**: Required for JSONB, UUID, and advanced features
- **psql**: Command-line client for applying migrations

---

## Troubleshooting

### Common Issues

#### "Relation already exists"
**Solution**: Use `IF NOT EXISTS` or check if migration already applied.

#### "Permission denied"
**Solution**: Grant appropriate permissions to database user.

#### "Foreign key violation"
**Solution**: Ensure parent records exist before inserting child records.

#### Slow migrations
**Solution**:
- Add indexes in separate transaction (CREATE INDEX CONCURRENTLY)
- Break large migrations into smaller chunks
- Schedule during maintenance window

---

## Future Enhancements
- **Migration tracking table**: Track which migrations have been applied
- **Rollback scripts**: Automated DOWN migrations
- **Migration tool**: Use node-pg-migrate or similar
- **Seed data**: Sample data for development/testing
- **Schema versioning**: Track schema version in database

