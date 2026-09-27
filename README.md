# Update Me

Nigeria-focused community real-time information platform.

## Structure

```
update-me/
  frontend/     Next.js + Tailwind (http://localhost:3000)
  backend/      Express API (http://localhost:5000)
  docs/         Architecture + operations notes
  deploy/       Nginx / systemd / PM2 samples + smoke scripts
```

## Local development

```bash
# Backend
cd backend && npm install && npm run migrate && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

## Production / VPS

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the full runbook (env contract, Nginx, systemd/PM2, migrations, smoke tests, rollback).

Also: [docs/production-readiness.md](docs/production-readiness.md), [docs/OPERATIONS.md](docs/OPERATIONS.md).

See [docs/FOUNDATION.md](docs/FOUNDATION.md) for setup foundations.
