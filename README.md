# OpenRMM

A modern, open-source Remote Monitoring and Management platform for MSPs.

## Architecture

| Component | Technology | Port |
|-----------|-----------|------|
| **Backend API** | FastAPI + SQLAlchemy (async) | 8000 |
| **Frontend** | React + Vite + Tailwind CSS | 5173 |
| **Database** | PostgreSQL 15 | 5432 |
| **Cache** | Redis 7 | 6379 |
| **Message Queue** | NATS 2 | 4222 |
| **Remote Desktop** | MeshCentral (embedded) | 4430 |
| **Reverse Proxy** | Nginx | 80/443 |

## Features

- **Agent Management** — Lightweight Python agent with auto-update, heartbeat, and system monitoring
- **Remote Terminal** — WebSocket-based terminal access through the OpenRMM UI
- **Remote Desktop** — MeshCentral integration, fully embedded in OpenRMM (no separate login)
- **Auto-Install** — MeshCentral agent is automatically downloaded and configured by the OpenRMM agent
- **Monitoring** — CPU, RAM, disk, services, and custom checks
- **Patch Management** — Track and manage software updates
- **Alert System** — Real-time alerts via WebSocket
- **Multi-Tenant** — Client and site hierarchy

## Quick Start

```bash
# Clone
git clone https://github.com/Derfwins/openrmm.git
cd openrmm

# Configure
cp .env.example .env
# Edit .env with your settings

# Start all services
docker compose up -d

# Access
# Frontend: https://rmmapp.derfwins.com (or http://localhost)
# API Docs: https://rmmapp.derfwins.com/docs
```

### Default Login
- **Username:** admin
- **Password:** admin

## Agent Deployment

### Windows (PowerShell, run as Administrator)

Download `install.ps1` and `openrmm-agent.py` from the server, then:

```powershell
.\install.ps1 -Server https://rmmapp.derfwins.com -ClientId 1 -SiteId 1
```

The installer:
1. Installs Python 3 (if missing) and dependencies
2. Copies the agent to `C:\Program Files\OpenRMM\`
3. Registers a scheduled task running as SYSTEM on startup
4. Starts the agent immediately

### Auto-Configuration

On first startup, the OpenRMM agent automatically:
- Registers with the server and receives an agent ID
- **Downloads and installs the MeshCentral remote access agent** (no manual steps)
- The MeshCentral agent connects via `wss://<server>/agent.ashx` through nginx
- Device appears in the "Managed Devices" group in MeshCentral
- Enables remote desktop and terminal access through the OpenRMM UI

### Agent Auto-Update

The agent checks for updates on every heartbeat. Bumping `AGENT_VERSION` in the served file triggers automatic updates across all agents.

## Nginx Routing

| Path | Target | Purpose |
|------|--------|---------|
| `/v2/` | Backend | API endpoints |
| `/ws/` | Backend (WebSocket) | Agent & browser real-time |
| `/mesh/api/` | Backend | MeshCentral API proxy |
| `/mesh/` | MeshCentral UI | Embedded remote desktop |
| `/meshws/` | MeshCentral (WebSocket) | MeshCentral WS |
| `/agent.ashx` | MeshCentral (WebSocket) | Agent connection |
| `/meshagents` | MeshCentral | Agent binary downloads |
| `/meshagents.ashx` | MeshCentral | Agent binary downloads |
| `/agentinvite` | MeshCentral | Agent invite page |
| `/` | Frontend (Vite) | SPA |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /v2/checkcreds/` | POST | Verify credentials (step 1 of login) |
| `POST /v2/login/` | POST | Full login with optional 2FA |
| `GET /agents/` | GET | List all agents |
| `POST /agents/heartbeat/` | POST | Agent heartbeat |
| `GET /mesh/api/download-agent/` | GET | Download MeshCentral agent |
| `GET /mesh/api/download-configured-agent/` | GET | Download pre-configured MeshCentral agent |
| `GET /mesh/api/mesh-config/` | GET | Get MeshCentral mesh configuration |
| `GET /mesh/api/sso-token/` | GET | Generate MeshCentral SSO token |

Full interactive docs at `/docs` (Swagger UI).

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
│   │   └── routers/        # API route handlers
│   │       ├── agents.py   # Agent CRUD & heartbeat
│   │       ├── mesh.py     # MeshCentral integration
│   │       ├── terminal.py # Remote terminal WebSocket
│   │       ├── desktop.py  # Remote desktop (MeshCentral)
│   │       └── monitoring.py # Monitoring & alerts
│   ├── Dockerfile
│   └── requirements.txt
├── agent/                  # Python agent (runs on managed devices)
│   ├── openrmm-agent.py    # Main agent script
│   ├── install.ps1         # Windows installer
│   ├── install.sh          # Linux installer
│   └── requirements.txt
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── services/        # API service layer
│   │   ├── contexts/        # React contexts (WebSocket, devices)
│   │   └── types/          # TypeScript types
│   ├── Dockerfile
│   └── package.json
├── docker/
│   ├── nginx/nginx.conf    # Reverse proxy config
│   ├── meshcentral/        # MeshCentral config & setup
│   └── postgres/           # DB init scripts
├── docker-compose.yml      # Full stack deployment
└── .env                    # Environment variables
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | localhost | PostgreSQL host |
| `POSTGRES_PASSWORD` | openrmm_dev_2026 | DB password |
| `REDIS_HOST` | localhost | Redis host |
| `SECRET_KEY` | (dev key) | JWT signing key |
| `DEBUG` | True | Debug mode |
| `MESH_SERVER_URL` | https://rmmapp.derfwins.com | MeshCentral external URL |
| `MESH_INTERNAL_URL` | http://meshcentral:4430 | MeshCentral internal URL |
| `MESH_LOGIN_TOKEN_KEY` | (empty) | MeshCentral admin login key |
| `MESH_MESH_ID` | (empty) | MeshCentral device group mesh ID |

## MeshCentral Integration

OpenRMM embeds MeshCentral for remote desktop and terminal access. The integration is seamless — users never see or interact with MeshCentral directly.

### How it works

1. OpenRMM agent downloads a **pre-configured MeshCentral agent EXE** (with meshid baked in)
2. The agent installs it as a Windows service (`Mesh Agent`)
3. MeshAgent connects to `wss://<server>/agent.ashx` (proxied through nginx to MeshCentral)
4. The device appears in MeshCentral's "Managed Devices" group
5. OpenRMM's UI embeds MeshCentral via iframe with SSO for remote desktop

### Key endpoints

- `/mesh/api/download-configured-agent/` — Serves the pre-configured agent EXE (generated by MeshCentral with meshid)
- `/mesh/api/mesh-config/` — Returns mesh configuration (MeshID, ServerID) for .msh files
- `/mesh/api/sso-token/` — Generates SSO tokens for iframe embedding

## License

OpenRMM is released under the MIT License.