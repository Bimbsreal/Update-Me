# Geography system

## Current status

| Entity | Count | Notes |
|--------|------:|-------|
| Country | 1 | Nigeria |
| States | 37 | 36 states + FCT |
| LGAs | 774 | Authoritative dataset |
| Areas / neighbourhoods | 39 | Starter set (Lagos-heavy); not nationwide |
| Cities / towns | 0 | Schema ready |
| Roads | 0 | Schema ready — no invented rows |
| Landmarks | 0 | Schema ready — no invented rows |
| Locations index | ~851 | Country + states + LGAs + areas |

## Source data

LGAs: [xosasx/nigerian-local-government-areas](https://github.com/xosasx/nigerian-local-government-areas) → `backend/data/lgas.json` (774 records).

Area samples live in `backend/src/db/seed-geography.js` and are keyed to authoritative LGA names.

## PostGIS

PostGIS is **not** installed on this local PostgreSQL 18 instance (Windows elevated install was blocked).

- Columns: `latitude` / `longitude` on locations (and related tables)
- Nearby: Haversine distance today
- Ready path: `migrations/deferred/004_locations_postgis.sql` adds `geography(Point,4326)` + GiST index when PostGIS is available
- Install helper: `docs/install-postgis-windows.ps1`

## Seed commands

```bash
cd backend
npm run migrate
npm run seed:geo        # sample areas
npm run seed:geo:full   # Nigeria + all LGAs + locations search index
```

## Still needed (data ingestion later)

- Nationwide area/neighbourhood dataset
- Cities/towns dataset
- Verified Lagos roads and landmarks
- Optional PostGIS install for native spatial indexes
