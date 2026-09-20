# Database foundation

## Entities (migration `001_foundation.sql`)

Geographic: `states`, `lgas`, `areas`, `neighbourhoods`, `roads`, `landmarks`, `locations`

Core reports: `reports`, `report_confirmations`, `report_updates`

Domain: `traffic_reports`, `fuel_stations`, `fuel_reports`, `transport_routes`, `transport_fare_reports`, `commodities`, `commodity_price_reports`

Knowledge: `questions`, `answers`

Official: `official_sources`, `official_updates`

User prefs: `notifications`, `saved_areas`, `saved_routes`, `moderation_actions`, `users`

## Principles encoded

- Location is first-class (`geography` / `geometry` via PostGIS)
- Reports carry what / where / when / source / status
- `source_type` distinguishes community vs official
- `expires_at` + `expire_stale_reports()` support freshness
- Hierarchy is nationwide-ready (state → LGA → area → neighbourhood)

## Commands

```bash
cd backend
npm run migrate
npm run migrate:status
```

## PostGIS foundation schema

The full PostGIS schema lives in `backend/migrations/deferred/001_foundation_postgis.sql`.
It is deferred until PostGIS is installed locally.

Auth/onboarding uses `002_auth_onboarding.sql` (no PostGIS required).


### Local Windows note (PostgreSQL 18)

PostGIS is not bundled with the default EDB installer. A Windows bundle was prepared for this machine:

1. Bundle path (already downloaded during foundation setup when available):
   `%TEMP%\postgis-pg18\postgis-bundle-pg18-3.6.2x64`
2. Official download: https://download.osgeo.org/postgis/windows/pg18/
3. Run `docs/install-postgis-windows.ps1` **as Administrator**, then:

```bash
psql -U postgres -d update_me -c "CREATE EXTENSION postgis;"
cd backend && npm run migrate
```

Until PostGIS binaries are installed into PostgreSQL, `npm run migrate` will fail on `CREATE EXTENSION postgis`, while the API health endpoint remains usable and reports `database.postgis: false`.
