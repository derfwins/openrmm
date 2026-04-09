# OpenRMM Deployment Guide

## Deploy to Your Own Server

### Prerequisites
- Linux server (Ubuntu 20.04+ recommended)
- Docker & Docker Compose installed
- Git installed
- SSH access

### Quick Deploy

```bash
# 1. SSH to your server
ssh user@your-server.com

# 2. Clone the repo
git clone https://github.com/yourusername/openrmm.git /opt/openrmm
cd /opt/openrmm

# 3. Configure environment
cp .env.example .env
nano .env  # Edit your settings

# 4. Deploy
./scripts/deploy.sh
```

### Manual Deploy (No Docker)

If you prefer not to use Docker:

```bash
# Frontend (Node.js + Nginx)
cd /opt/openrmm/frontend
npm install
npm run build
# Serve dist/ folder with Nginx

# Backend (Python + Gunicorn)
cd /opt/openrmm/api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Configure settings
python manage.py migrate
python manage.py collectstatic
# Run with gunicorn or systemd
```

### Configuration

Edit these files before deploy:

- `.env` - Database, secrets, API keys
- `docker-compose.yml` - Service configuration
- `frontend/.env` - Frontend API URLs

### Post-Deploy

Access your instance at:
- Frontend: `http://your-server-ip:5173`
- Backend API: `http://your-server-ip:8000/api`

### Troubleshooting

See `PROGRESS.md` and `DAILY_REPORT.md` for build status.

---

**Need help?** Check the deployment scripts in `./scripts/`
