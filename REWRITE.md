# OpenRMM - Custom Backend Rewrite

## Decision (2026-04-14)
Replacing the Tactical RMM Django backend with a custom FastAPI backend.
Removing all references to Tactical RMM. The frontend stays (it's 100% custom already).

## Architecture
- **Backend:** FastAPI (Python 3.11+), async
- **Database:** PostgreSQL (same instance)
- **Cache/Queue:** Redis (same instance)  
- **Task Queue:** Celery → will migrate to FastAPI background tasks or arq
- **Frontend:** React + Vite + Tailwind (unchanged)
- **Remote Desktop:** Mesh Central (kept as dependency for now)
- **Agent:** Future — Go binary for Windows/Linux

## What We're Building
Custom REST API that serves the existing frontend endpoints.
No Tactical RMM code — clean room implementation.

## Repository
https://github.com/Derfwins/openrmm.git

## Server
- 10.10.0.122 (user: fhowland, pass: fxp20Vfh!!)
- Frontend: rmmapp.derfwins.com (Cloudflare → :5173)
- API: rmm.derfwins.com (Cloudflare → :8000)
- Mesh: mesh.derfwins.com (Cloudflare → :8080)