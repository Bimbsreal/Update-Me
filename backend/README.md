# Backend

Node.js + Express REST API for Update Me.

## Local setup

1. Copy `.env.example` to `.env` and set database credentials.
2. Ensure PostgreSQL is running and PostGIS is available.
3. Create the database: `createdb update_me` (or via psql).
4. Install dependencies: `npm install`
5. Run migrations: `npm run migrate`
6. Start the API: `npm run dev`

API base: http://localhost:5000/api/v1  
Health: http://localhost:5000/api/v1/health
