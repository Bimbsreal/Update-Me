# Traffic module

Built on the Generic Report Engine (`reports` + confirmations/history).

## Schema

`traffic_reports` links 1:1 to `reports` and stores:

- severity (`clear` … `blocked` / `unknown`)
- optional cause
- road name / optional road_id
- direction labels (`from` / `toward` / combined label)
- affected section, estimated delay

Freshness/expiry uses `category_freshness_policies` for `traffic` (default TTL 180m, stale 60m).

## API

`/api/v1/traffic`

- `GET /`, `/nearby`, `/summary`, `/:id`, `/:id/history`
- `POST /` (auth) — creates generic report + traffic row
- `POST /:id/confirm`, `POST /:id/correct` — delegates to report engine

## Frontend

- `/traffic` dashboard
- `/traffic/[id]` detail
- `TrafficComposer`, `TrafficCard`
- Home traffic summary card
- Explore filter → Traffic
- Report composer branches to traffic form when category = Traffic
