# Update Me — VPS deployment runbook

Practical single-VPS deployment for the existing architecture (Next.js + Express + PostgreSQL/PostGIS + Nginx + SSE).  
**This repository does not auto-deploy.** Run these steps deliberately.

Related docs: [production-readiness.md](./production-readiness.md), [OPERATIONS.md](./OPERATIONS.md), [DATABASE.md](./DATABASE.md).

## Architecture (target)

```
Internet → Nginx (:80/:443)
            ├─ /                 → Next.js 127.0.0.1:3000
            ├─ /api/             → Express 127.0.0.1:5000
            └─ /api/v1/realtime/ → Express SSE (buffering off)
```

- One API process only (in-process schedulers + SSE must not be duplicated).
- Node ports stay on localhost; Nginx is the only public entry.

## Prerequisites

| Component | Requirement |
|-----------|-------------|
| OS | Ubuntu 22.04+ (or similar Linux VPS) |
| Node.js | **≥ 20** |
| npm | bundled with Node |
| PostgreSQL | **≥ 14** |
| PostGIS | recommended for spatial indexes |
| Nginx | current stable |
| Process manager | **systemd** (preferred) or **PM2** |
| TLS | Let’s Encrypt / certbot (after DNS) |

## Environment contract

### Backend (`/etc/update-me/api.env` or `backend/.env`)

Required:

| Variable | Notes |
|----------|--------|
| `NODE_ENV` | `production` |
| `HOST` | `127.0.0.1` behind Nginx |
| `PORT` | `5000` |
| `CORS_ORIGIN` | Exact public origin, e.g. `https://example.com` (**no `*`**) |
| `TRUST_PROXY` | `true` |
| `DATABASE_URL` | Production DB URL (or `DB_*`) |
| `JWT_SECRET` | ≥ 32 random chars; never a `change_me` / `local_dev` placeholder |
| `COOKIE_NAME` | default `um_session` |

Important optional:

| Variable | Notes |
|----------|--------|
| `DB_SSL` | `true` if DB requires TLS |
| `FX_*` / `OFFICIAL_*` | Provider + sync controls (server-side only) |
| `FX_ADMIN_TOKEN` / `OFFICIAL_ADMIN_TOKEN` | Automation headers only — never unlock `/admin/*` |
| `INGESTION_ALLOW_LOCALHOST` | **must be unset/false** in production |
| `ALLOW_LOCAL_DB_IN_PRODUCTION` | set `true` only if Postgres is on the same VPS via localhost |

Startup **rejects** weak JWT secrets, localhost CORS, and localhost ingestion in `NODE_ENV=production`.

### Frontend (`/etc/update-me/web.env` or `frontend/.env.production.local`)

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_SITE_URL` | Canonical public URL `https://example.com` |
| `NEXT_PUBLIC_API_BASE_URL` | Prefer `https://example.com/api/v1` (same-origin via Nginx) |
| `BACKEND_ORIGIN` | Server-only rewrite target, usually `http://127.0.0.1:5000` |
| `NEXT_PUBLIC_MAP_TILE_URL` / `NEXT_PUBLIC_MAP_STYLE_URL` | Public map config only |

**Never** put JWT secrets, DB passwords, storage keys, or admin tokens in `NEXT_PUBLIC_*`.

### Separation rules

| Concern | Rule |
|---------|------|
| Dev DB | Never point production `DATABASE_URL` at a laptop DB |
| Prod DB | Never use production credentials from local `.env` committed to git |
| Secrets | Live only in `/etc/update-me/*.env` or a secret manager; `chmod 600` |
| Providers | Disable unverified FX/official providers until approved |

## First-time server setup

```bash
# 1) System user + dirs
sudo useradd --system --create-home --home-dir /opt/update-me --shell /usr/sbin/nologin updateme
sudo mkdir -p /opt/update-me /etc/update-me /var/log/update-me /var/backups/update-me
sudo chown -R updateme:updateme /opt/update-me /var/log/update-me

# 2) Install Node 20+, PostgreSQL, PostGIS, Nginx
# 3) Create database + role (example)
sudo -u postgres psql <<'SQL'
CREATE USER update_me_app WITH PASSWORD 'REPLACE_STRONG_PASSWORD';
CREATE DATABASE update_me OWNER update_me_app;
\c update_me
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SQL

# 4) Clone / upload release into /opt/update-me
# 5) Write env files (never commit them)
sudo install -m 600 /dev/null /etc/update-me/api.env
sudo install -m 600 /dev/null /etc/update-me/web.env
# edit with production values
```

## Database: backup → migrate → verify

```bash
# Backup BEFORE migrate
sudo -u postgres pg_dump -Fc -f /var/backups/update-me/update_me_$(date +%F_%H%M).dump update_me

cd /opt/update-me/backend
sudo -u updateme npm ci
sudo -u updateme bash -lc 'set -a; source /etc/update-me/api.env; set +a; npm run migrate:status'
sudo -u updateme bash -lc 'set -a; source /etc/update-me/api.env; set +a; npm run migrate'
sudo -u updateme bash -lc 'set -a; source /etc/update-me/api.env; set +a; npm run migrate:status'
```

Never run destructive reset/seed scripts against production.

## Application install / build

```bash
cd /opt/update-me/backend
sudo -u updateme npm ci --omit=dev

cd /opt/update-me/frontend
sudo -u updateme npm ci
sudo -u updateme bash -lc 'set -a; source /etc/update-me/web.env; set +a; npm run build'
```

**Important:** do not run `next dev` and `next start` against the same `.next` directory concurrently — they corrupt the build. Production hosts should only run `next start` after `npm run build`.

## Process management

### Option A — systemd (recommended)

```bash
sudo cp deploy/systemd/update-me-api.service /etc/systemd/system/
sudo cp deploy/systemd/update-me-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now update-me-api update-me-web
sudo systemctl status update-me-api update-me-web
```

### Option B — PM2

```bash
cd /opt/update-me
# Export env into the shell or use pm2 ecosystem env_file support
pm2 start deploy/pm2/ecosystem.config.cjs
pm2 save
pm2 startup
```

**Do not** run `instances > 1` for the API.

## Nginx + HTTPS

```bash
sudo cp deploy/nginx/update-me.conf /etc/nginx/sites-available/update-me
# edit server_name
sudo ln -sf /etc/nginx/sites-available/update-me /etc/nginx/sites-enabled/update-me
sudo nginx -t && sudo systemctl reload nginx

# After DNS points here:
sudo certbot --nginx -d example.com -d www.example.com
# Then enable HSTS line in the sample config and reload
```

SSE location `/api/v1/realtime/` must keep `proxy_buffering off` and a long `proxy_read_timeout`.

### Geolocation (precise device location)

Browser Geolocation requires a **secure context**:

- **Production:** serve the site over **HTTPS** (Let’s Encrypt / Certbot as above). Geolocation will not work on plain `http://` production hosts.
- **Local development:** `http://localhost:3000` (and `127.0.0.1`) is treated as a secure context by browsers — precise location works without HTTPS locally.
- Do **not** attempt workarounds to enable geolocation over insecure public HTTP.
- Users can always choose a location manually if device location is unavailable or denied.
- The service worker must never cache precise coordinates or private location API responses (API/SSE are already excluded from the SW cache).

## Low-downtime deploy sequence (single VPS)

1. Announce maintenance if needed (brief restart expected)
2. `pg_dump` backup
3. Upload/checkout new release under `/opt/update-me` (or side-by-side release dir)
4. Install backend deps (`npm ci --omit=dev`)
5. Install frontend deps + `npm run build`
6. Verify `/etc/update-me/*.env`
7. Run migrations (`migrate:status` → `migrate` → `migrate:status`)
8. Restart API then web (`systemctl restart update-me-api update-me-web`)
9. `curl -fsS https://example.com/api/v1/health/ready`
10. Run smoke checklist (below)
11. Inspect journald / PM2 logs
12. Confirm Admin → System health

Zero downtime is **not** promised on a single VPS with in-process SSE.

## Graceful shutdown

API handles `SIGTERM`/`SIGINT` by:

1. Stopping schedulers / metrics flusher  
2. Closing SSE connections  
3. Stopping new HTTP accepts (`server.close`)  
4. Closing the DB pool  
5. Forced exit after `SHUTDOWN_TIMEOUT_MS` (default 15s)

## Smoke-test checklist

### Infrastructure

- [ ] `GET /api/v1/health/live` → 200  
- [ ] `GET /api/v1/health/ready` → 200  
- [ ] `GET /api/v1/health` → 200 (`healthy` or `degraded` only if PostGIS missing)  
- [ ] Logs show `env_validated` / `api_listening` without secrets  
- [ ] Only one API process  

### Public

- [ ] Landing `/`  
- [ ] Public traffic / official update pages  
- [ ] Public location page  
- [ ] Global search  
- [ ] Logo → `/`  
- [ ] `manifest.webmanifest` + `/sw.js`  

### User

- [ ] Sign in / out  
- [ ] Home  
- [ ] Location selector  
- [ ] Device location permission + Near Me (HTTPS / localhost)  
- [ ] Manual location fallback when GPS denied  
- [ ] Explore  
- [ ] Create a report  
- [ ] Directions → From: my current location  
- [ ] Notifications  
- [ ] Saved area/route  

### Modules

- [ ] Traffic, Fuel, Transport, Prices, Alerts, Directions, Community, Official, FX  

### Admin

- [ ] `/admin`  
- [ ] Moderation, data sources, locations, data quality, **system health**, audit log  

### SSE / PWA

- [ ] Authenticated `GET /api/v1/realtime/events` stays open; heartbeats arrive  
- [ ] PWA install / offline page safe (no private API caching)  

Local smoke helper (development machine):

```bash
# PowerShell
./deploy/scripts/smoke-local.ps1

# Bash
./deploy/scripts/smoke-local.sh
```

## Rollback

1. Restore previous release directory / git tag  
2. Restore DB dump **only if** a migration is incompatible (`pg_restore` to a staging DB first when possible)  
3. Rebuild frontend if needed  
4. Restart services  
5. Re-check `/health/ready` + smoke tests  

## Recovery references

- Backups: [production-readiness.md](./production-readiness.md)  
- Observability: [OPERATIONS.md](./OPERATIONS.md)  
- Sample configs: `deploy/nginx/`, `deploy/systemd/`, `deploy/pm2/`
