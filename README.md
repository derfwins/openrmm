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
| **Remote Desktop** | Custom WebRTC (aiortc) | — |
| **Reverse Proxy** | Nginx | 80/443 |

## Features

- **Agent Management** — Lightweight Python agent with auto-update, heartbeat, and system monitoring
- **Remote Terminal** — WebSocket-based terminal access through the OpenRMM UI
- **Remote Desktop** — Custom WebRTC remote desktop with full mouse/keyboard control, no third-party dependencies
- **Auto-Install** — Agent installer automatically sets up the OpenRMM agent as a Windows scheduled task
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
# Frontend: https://openrmm.derfwins.com (or http://localhost)
# API Docs: https://openrmm.derfwins.com/docs
```

### Default Login
- **Username:** admin
- **Password:** admin

## Agent Deployment

### Windows (PowerShell, run as Administrator)

Download `install.ps1` and `openrmm-agent.py` from the server, then:

```powershell
.\install.ps1 -Server https://openrmm.derfwins.com -ClientId 1 -SiteId 1
```

The installer:
1. Installs Python 3 (if missing) and dependencies
2. Copies the agent to `C:\Program Files\OpenRMM\`
3. Registers a scheduled task running as SYSTEM on startup
4. Starts the agent immediately

### Auto-Configuration

On first startup, the OpenRMM agent automatically:
- Registers with the server and receives an agent ID
- Connects via WebSocket for real-time communication
- Enables remote desktop and terminal access through the OpenRMM UI

### Agent Auto-Update

The agent checks for updates on every heartbeat. Bumping `AGENT_VERSION` in the served file triggers automatic updates across all agents.

## Nginx Routing

| Path | Target | Purpose |
|------|--------|---------|
| `/v2/` | Backend | API endpoints |
| `/ws/` | Backend (WebSocket) | Agent & browser real-time |
| `/` | Frontend (Vite) | SPA |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /v2/checkcreds/` | POST | Verify credentials (step 1 of login) |
| `POST /v2/login/` | POST | Full login with optional 2FA |
| `GET /agents/` | GET | List all agents |
| `POST /agents/heartbeat/` | POST | Agent heartbeat |
| `GET /v2/desktop/{agent_id}/` | GET | WebRTC desktop signaling |

Full interactive docs at `/docs` (Swagger UI).

## Remote Desktop

OpenRMM includes a custom-built WebRTC remote desktop system — no third-party remote desktop tools required.

### How it works

1. OpenRMM agent runs on the Windows device as a SYSTEM scheduled task
2. When a user clicks "Remote Desktop" in the UI, the browser establishes a WebRTC peer connection via the backend signaling channel
3. The agent launches a capture helper process in the interactive user session (using `WTSQueryUserToken` + `CreateProcessAsUserW`) which captures the screen via BitBlt and streams H.264 video over WebRTC
4. A separate input helper process (also in the user session) receives mouse/keyboard events from the browser via DataChannel and injects them via `SendInput`
5. Both helper processes use `pythonw.exe` with `CREATE_NO_WINDOW` so no console windows appear

### Key components

- **webrtc_desktop.py** — Main WebRTC handler: SDP offer/answer, ICE candidates, screen capture track, DataChannel input relay
- **input_helper.py** — Runs in the user session, listens on named pipe `\\.\pipe\openrmm_input`, calls `SendInput` for mouse/keyboard events
- **RemoteDesktop.tsx** — Frontend React component with WebRTC peer connection, DataChannel input handling, and TURN server configuration

### Requirements

- **Virtual Display Driver** (e.g., MttVDD/IddSampleDriver) for headless servers — provides a virtual display when no physical monitor is attached
- **TURN server** (Coturn) for NAT traversal — relay candidates for browsers and agents behind NAT
- **Windows** — screen capture and input injection currently Windows-only

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
│   │       ├── terminal.py # Remote terminal WebSocket
│   │       ├── desktop.py  # Remote desktop (WebRTC signaling)
│   │       └── monitoring.py # Monitoring & alerts
│   ├── Dockerfile
│   └── requirements.txt
├── agent/                  # Python agent (runs on managed devices)
│   ├── openrmm-agent.py    # Main agent script
│   ├── webrtc_desktop.py   # WebRTC remote desktop handler
│   ├── input_helper.py     # Input injection helper (user session)
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
| `TURN_SERVER_URL` | (none) | TURN server URL for WebRTC |
| `TURN_USERNAME` | (none) | TURN server username |
| `TURN_PASSWORD` | (none) | TURN server password |

## License

OpenRMM is released under the MIT License.