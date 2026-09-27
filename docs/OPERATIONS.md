# Operations — observability & health

Practical guide for running Update Me on a single VPS without a heavyweight observability stack.

## Health endpoints

| Endpoint | Purpose | Failure semantics |
|----------|---------|-------------------|
| `GET /api/v1/health/live` | Process is alive | Always **200** if the Node process is listening |
| `GET /api/v1/health/ready` | Critical dependency check | **503** when PostgreSQL is unreachable |
| `GET /api/v1/health` | Combined status | **200** for `healthy` / `degraded`; **503** for `unhealthy` |

### Status model

- **healthy** — API + database OK; optional PostGIS present
- **degraded** — API can serve traffic but a non-critical capability is missing (e.g. PostGIS not installed; Haversine nearby still works)
- **unhealthy** — critical dependency down (database)

Optional external sources (FX, official ingestion) **never** mark the public health endpoint unhealthy.

Public payloads do **not** include database name, connection strings, stack traces, or secrets.

Detailed diagnostics: **Admin → System health** (`GET /api/v1/admin/system-health`, staff session + `dashboard` permission).

## Request IDs

- Header: `X-Request-Id`
- Clients may send a safe ID matching `^[A-Za-z0-9._-]{8,128}$`; otherwise the API generates a UUID
- Echoed on every response
- Included in structured access logs and JSON error bodies
- Never used for authorization decisions

## Structured logging

Stdout JSON lines (examples):

```json
{"level":"info","msg":"http_request","ts":"...","requestId":"...","method":"GET","path":"/api/v1/traffic","status":200,"durationMs":42,"userId":null,"role":null}
{"level":"info","msg":"job_run_finished","executionId":"...","status":"success","durationMs":120,"recordsProcessed":3}
```

**Never logged:** passwords, tokens, cookies, API keys, private GPS, full private report bodies.

Production suppresses successful health polls; logs slow requests (≥ 800ms by default).

## Background jobs

Schedulers record rows in `job_runs` (in addition to existing per-source tables):

| Job name | Role |
|----------|------|
| `data_quality.freshness_tick` | Report stale/expiry transitions |
| `fx.sync_tick` | FX provider sync tick |
| `official.sync_tick` | Official/ingestion sync tick |
| `ops.retention_cleanup` | Purge old job runs + API metric buckets |

Existing tables remain authoritative for detail:

- `fx_sync_runs` / `fx_sync_state`
- `official_sync_runs` / source health columns

### Failure isolation

- One FX provider failure does not wipe last-known-good observations
- One official source failure does not stop other sources in the same tick
- Data-quality publishes per-record; one SSE publish error does not abort the tick
- Job wrappers catch unexpected errors so the process stays up

## Provider fallback visibility

When an FX provider is failing but prior observations exist, Admin System Health shows **fallback: last-known-good**. Product surfaces must not claim those rates are live.

## Metrics

`api_metrics_hourly` stores coarse aggregates (method + path group with UUIDs collapsed). Retention default **14 days** (`API_METRICS_RETENTION_DAYS`).

`job_runs` retention default **30 days** (`JOB_RUNS_RETENTION_DAYS`).

Audit log retention is separate — do not purge for convenience.

## SSE

- In-process broker; connection counts reset on restart
- Auth required; per-user connection cap
- Admin System Health shows connections, write errors, disconnects
- One broken client is removed; others continue

## Operational signals (admin)

Threshold examples (computed on System Health load, not push alerts):

- Database unreachable → critical
- ≥5% 5xx with ≥20 errors / 24h → warning
- Many slow requests → info
- Failing ingestion sources / FX providers → warning

## Safe restart

1. `GET /api/v1/health/ready` should return 200 after start
2. Schedulers start non-fatally; check Admin System Health → latest job runs
3. If providers misbehave: set `FX_SYNC_ON_STARTUP=false` / `OFFICIAL_SYNC_ON_STARTUP=false` and restart
4. Backups: see `docs/production-readiness.md`

## Common failures

| Symptom | Check |
|---------|--------|
| Ready 503 | PostgreSQL connectivity / `DATABASE_URL` |
| Degraded health | PostGIS extension missing (optional) |
| Stale FX | Admin System Health → FX providers / last success |
| Ingestion quiet | Official source status, ingestion runs, job `official.sync_tick` |
| SSE clients drop | Nginx buffering off; `/admin/system-health` SSE panel |
