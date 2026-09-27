# Production readiness — Update Me

This document describes how to operate Update Me safely in a real environment.
It does **not** contain secrets. Use your own secret store / environment for credentials.

## Scope

Update Me is a Nigeria-focused local information utility (traffic, fuel, transport, prices, safety, official updates, explore, home). This guide covers deployment, security, reliability, and observability expectations after the hardening pass.

**VPS deployment runbook:** [DEPLOYMENT.md](./DEPLOYMENT.md)  
**Day-2 operations:** [OPERATIONS.md](./OPERATIONS.md)

## Runtime requirements

| Component | Requirement |
|-----------|-------------|
| Node.js | **≥ 20** |
| PostgreSQL | **≥ 14** recommended |
| PostGIS | Required for nearby / explore spatial queries |
| Reverse proxy | Nginx or equivalent (TLS termination, SSE buffering off) |

## Repository layout

- `backend/` — Express API (`/api/v1`), SSE, schedulers
- `frontend/` — Next.js app (port 3000 in development)
- `backend/migrations/` — ordered SQL migrations
- `docs/` — operational and module docs

## Required environment variables

### Backend (`backend/.env`)

Copy from `backend/.env.example`. Critical values:

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | `production` in live environments |
| `PORT` | API port (default `5000`) |
| `CORS_ORIGIN` | Exact frontend origin (credentials enabled — **no `*`**) |
| `JWT_SECRET` | Long random secret (≥ 16 chars; use 32+ in production) |
| `JWT_EXPIRES_IN` | Session lifetime (default `7d`) |
| `DATABASE_URL` or `DB_*` | PostgreSQL connection |
| `DB_SSL` | `true` when DB requires TLS |
| `DB_SSL_REJECT_UNAUTHORIZED` | Set `false` only for broken lab certs; **prefer proper CA** |
| `TRUST_PROXY` | Set `true` behind Nginx so rate limits see real client IPs |
| `FX_ADMIN_TOKEN` | Optional header secret for FX sync admin only |
| `OFFICIAL_ADMIN_TOKEN` | Optional header secret for official sync admin only |

**Do not** put automation tokens in query strings in production. Use headers:

- `x-fx-admin-token`
- `x-official-admin-token`

`/admin/*` requires a **staff session** (role + permission). FX/Official tokens no longer unlock the full admin API.

### Frontend (`frontend/.env.local`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | API base, e.g. `https://api.example.com/api/v1` |
| `BACKEND_ORIGIN` | Used by Next rewrites (`/api/backend/*`) — default `http://localhost:5000` |
| `NEXT_PUBLIC_MAP_*` | Optional MapLibre tile/style URLs |

## Local commands

```bash
# Database
cd backend
npm run migrate
npm run migrate:status

# API
npm run dev          # watch mode
npm start            # production entry

# Frontend
cd frontend
npm run dev
npm run build && npm start
```

## Health endpoints

| Path | Meaning |
|------|---------|
| `GET /api/v1/health/live` | Process up (always 200 if listening) |
| `GET /api/v1/health/ready` | DB reachable — **503** when not |
| `GET /api/v1/health` | Same readiness semantics as `/ready` |

All responses include `X-Request-Id`. Do not expose database name/version publicly in production payloads.

## Security baseline

- Passwords: bcrypt (cost 12); never logged
- Sessions: JWT in **HttpOnly** cookie (`Secure` in production, `SameSite=lax`)
- Suspended / inactive users rejected on login and on authenticated requests
- Registration duplicate responses are generic (anti-enumeration)
- Login rate limit: 10 / 15 min; registration: 10 / hour
- Global API rate limit + per-route write limiters
- Parameterized SQL via `pg`; Zod validation on inputs
- Pagination caps on list endpoints; JSON body limit `1mb`
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; HSTS only when `NODE_ENV=production`
- User content rendered as React text (no `dangerouslySetInnerHTML` in app code)
- Private user GPS (`private_lat` / `private_lng`) is not returned in public user APIs
- SSE requires auth; per-user connection caps; notification events are user-scoped

## Nginx / SSE notes

Sample production config: `deploy/nginx/update-me.conf`.

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:5000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Request-Id $request_id;
}

# SSE — disable buffering
location /api/v1/realtime/ {
  proxy_pass http://127.0.0.1:5000;
  proxy_http_version 1.1;
  proxy_set_header Connection '';
  proxy_buffering off;
  proxy_cache off;
  proxy_read_timeout 3600s;
  chunked_transfer_encoding off;
}
```

Terminate TLS at the proxy. Set `TRUST_PROXY=true` on the API.

## Backups (operator responsibility)

Automated backups are **not** bundled in this repository. Operators should configure:

1. **Daily** `pg_dump` (custom or SQL) of the application database
2. Retention (e.g. 7 daily + 4 weekly)
3. Periodic restore drills to a staging instance
4. Secure off-host storage for dump files

Example dump / restore (adjust connection):

```bash
pg_dump -Fc -f update_me_$(date +%F).dump "$DATABASE_URL"
pg_restore -d "$DATABASE_URL_STAGING" --clean --if-exists update_me_YYYY-MM-DD.dump
```

Also back up:

- Environment / secret configuration (out of band)
- Any object-storage buckets if uploads are enabled later

## Migrations

```bash
cd backend && npm run migrate
```

- Migrations run in filename order under `backend/migrations/`
- Do not delete historical migrations
- Production must not depend on local seed/demo scripts
- After restore from backup, verify `npm run migrate:status`

## Logging & observability

- JSON access logs include: `requestId`, method, path, status, `durationMs`, optional `userId` / admin `role`
- Slow requests (≥ 800ms) logged in production
- Health poll spam is suppressed in production
- Errors log `requestId` without passwords/tokens/private coordinates
- Clients receive `X-Request-Id` for support correlation
- Background jobs write to `job_runs`; FX/official keep detailed sync run tables
- Admin **System health** aggregates app/DB/jobs/ingestion/providers/SSE/metrics
- See **[OPERATIONS.md](./OPERATIONS.md)** for the operator runbook

Recommended (outside this repo): ship stdout logs to your host logging stack; alert on 5xx rate, ready endpoint failures, FX/official sync error lines.

## External providers

| Provider | Behavior |
|----------|----------|
| FX (Open ER API / optional others) | Timeouts configured; failures must not wipe last good observations; stale flags visible |
| Official sources | Approved sources only; failed sync logged; invalid payloads must not overwrite good rows |
| Map tiles | Client-side MapLibre; configure public tile/style URLs; no server-side tile proxy required |

## Rollback considerations

1. Keep previous API build artifact / container image
2. Database: prefer forward-fix migrations; restore from dump only if a migration is catastrophic
3. Feature flags are not required for this stack — disable schedulers via env (`FX_SYNC_ON_STARTUP=false`, `OFFICIAL_SYNC_ON_STARTUP=false`) if providers misbehave

## Verification checklist

- [ ] `GET /api/v1/health/ready` returns 200
- [ ] Registration / login / logout
- [ ] Suspended user cannot use session
- [ ] Ordinary user cannot call `/admin/*`
- [ ] Home, Explore, report create, notifications, SSE
- [ ] Frontend production build
- [ ] Backend tests (`npm test`)
- [ ] CORS origin matches the real frontend
- [ ] TLS + HSTS at the edge
- [ ] Backups configured and tested

## Remaining recommended work (not blocking local hardening)

- Session revocation list / token version on suspend (stronger than DB check alone under extreme load)
- Per-account progressive login lockout / CAPTCHA after repeated failures
- Content-Security-Policy tailored to MapLibre + API origins (start report-only)
- Dedicated object-storage upload pipeline with MIME sniffing (when images ship)
- Continuous dependency scanning in CI (`npm audit` + lockfile review)
