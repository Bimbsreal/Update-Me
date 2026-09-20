# Generic Report Engine

Category-agnostic reporting foundation for Update Me.

## Principles

- One reporting system → many future information categories
- Community reports never appear as official
- Status changes are auditable via `report_history`
- Flags feed moderation hooks; reports are not auto-deleted
- Category-specific business logic is **not** implemented here

## Key tables

- `report_categories` + `category_freshness_policies`
- `reports`
- `report_confirmations`
- `report_flags`
- `report_history`
- `report_event_groups` (duplicate grouping foundation)

## API

Base: `/api/v1/reports`

- `GET /categories`
- `GET /`, `GET /nearby`, `GET /:id`, `GET /:id/history`
- `POST /` (auth)
- `PATCH /:id` (owner)
- `POST /:id/confirm`, `POST /:id/correct`, `POST /:id/flag`

## Frontend

- `ReportComposer` — multi-step utility submission UI
- `ReportCard` + trust/status labels — reusable across Home/Explore/future modules
- Route: `/app/report`
