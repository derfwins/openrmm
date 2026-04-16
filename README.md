# OpenRMM

A modern, open-source Remote Monitoring and Management platform built from scratch.

## Architecture

| Component | Technology | Port |
|-----------|-----------|------|
| **Backend API** | FastAPI + SQLAlchemy (async) | 8000 |
| **Frontend** | React + Vite + Tailwind CSS | 5173 |
| **Database** | PostgreSQL 15 | 5432 |
| **Cache** | Redis 7 | 6379 |
| **Message Queue** | NATS 2 | 4222 |
| **Reverse Proxy** | Nginx | 80/443 |

## Quick Start

```bash
# Clone
git clone https://github.com/Derfwins/openrmm.git
cd openrmm

# Start all services
docker compose up -d

# Access
# Frontend: http://localhost:5173
# API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### Default Login
- **Username:** admin
- **Password:** admin

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /v2/checkcreds/` | POST | Verify credentials (step 1 of login) |
| `POST /v2/login/` | POST | Full login with optional 2FA |
| `GET /accounts/users/` | GET | List all users |
| `POST /accounts/users/` | POST | Create a user |
| `PUT /accounts/{id}/users/` | PUT | Update a user |
| `DELETE /accounts/{id}/users/` | DELETE | Delete a user |
| `POST /accounts/users/reset/` | POST | Reset user password |
| `PUT /accounts/users/reset_totp/` | PUT | Reset user MFA |
| `POST /accounts/users/setup_totp/` | POST | Setup MFA for user |
| `GET /accounts/roles/` | GET | List roles |
| `POST /accounts/roles/` | POST | Create role |
| `GET /clients/` | GET | List clients with sites |
| `POST /clients/` | POST | Create client + initial site |
| `DELETE /clients/{id}/` | DELETE | Delete client |
| `POST /clients/sites/` | POST | Create site under client |
| `GET /agents/` | GET | List all agents |
| `POST /agents/installer/` | POST | Generate install script |
| `POST /agents/heartbeat/` | POST | Agent heartbeat |
| `GET /core/settings/` | GET | Get core settings |
| `PUT /core/settings/` | PUT | Update settings |

Full interactive docs available at `/docs` (Swagger UI) when the backend is running.

## Authentication

OpenRMM uses JWT Bearer tokens. Login flow:

1. `POST /v2/checkcreds/` with `{username, password}`
   - If no MFA: returns `{token, expiry, totp: false}` — you're logged in
   - If MFA enabled: returns `{totp: true}` — proceed to step 2
2. `POST /v2/login/` with `{username, password, twofactor}` — returns token

All authenticated requests use `Authorization: Bearer <token>` header.

## Project Structure

```
openrmm/
├── api/                    # FastAPI backend
│   ├── v2/
│   │   ├── main.py         # Application entry point
│   │   ├── config.py       # Settings & configuration
│   │   ├── database.py     # SQLAlchemy setup
│   │   ├── auth.py         # JWT auth & password hashing
│   │   ├── models/         # SQLAlchemy models
│   │   │   ├── user.py     # User & Role
│   │   │   ├── client.py   # Client & Site
│   │   │   ├── agent.py    # Agent & Check
│   │   │   └── settings.py # CoreSettings
│   │   └── routers/        # API route handlers
│   │       ├── auth.py     # Login/checkcreds
│   │       ├── accounts.py # Users & roles CRUD
│   │       ├── clients.py  # Clients & sites CRUD
│   │       ├── agents.py   # Agents & installer
│   │       └── core.py     # Settings CRUD
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── services/       # API service layer
│   │   ├── config.ts       # Smart API URL detection
│   │   ├── App.tsx         # Main app with routing
│   │   └── index.css       # Tailwind styles
│   ├── Dockerfile
│   └── package.json
├── docker/
│   ├── nginx/              # Nginx config
│   └── postgres/           # DB init scripts
├── docker-compose.yml      # Full stack deployment
└── scripts/
    └── deploy.sh           # Deployment helper
```

## Configuration

Environment variables (set in docker-compose.yml or .env):

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | localhost | PostgreSQL host |
| `POSTGRES_PASSWORD` | openrmm_dev_2026 | DB password |
| `REDIS_HOST` | localhost | Redis host |
| `SECRET_KEY` | (dev key) | JWT signing key |
| `DEBUG` | True | Debug mode |
| `CORS_ORIGINS` | (multiple) | Allowed CORS origins |

## Deployment with Cloudflare Tunnels

For production, use Cloudflare tunnels instead of certbot:

- `rmm.derfwins.com` → Backend API (:8000)
- `rmmapp.derfwins.com` → Frontend (:5173)  
- `rmmapp.derfwins.com` → OpenRMM Dashboard (Cloudflare → nginx)

The frontend auto-detects the API URL based on hostname.

## License

OpenRMM is released under the MIT License.