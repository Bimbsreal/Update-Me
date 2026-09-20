# Update Me — Foundation

Nigeria-focused, community-powered real-time information platform.

## Local URLs

| Service  | URL |
|----------|-----|
| Frontend | http://localhost:3000 |
| Backend  | http://localhost:5000 |
| API      | http://localhost:5000/api/v1 |
| Health   | http://localhost:5000/api/v1/health |

## Stack

- Frontend: Next.js, JavaScript, Tailwind CSS
- Backend: Node.js, Express, Zod
- Database: PostgreSQL + PostGIS
- Maps (prepared): MapLibre GL JS + OSM-compatible tiles
- Realtime (prepared): SSE scaffolding

## Quick start

### 1. Database

1. Install PostgreSQL and the PostGIS extension.
2. Create database `update_me`.
3. Copy `backend/.env.example` → `backend/.env` and set credentials.
4. From `backend/`: `npm install` then `npm run migrate`

### 2. Backend

```bash
cd backend
npm run dev
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

## Product constraints

Update Me is utility-focused (traffic, fuel, transport, prices, directions, alerts, official updates). It is not a social network.
