# OpenRMM

AI-Powered Remote Monitoring & Management Platform

## Overview

OpenRMM is a modern, AI-enhanced RMM platform built on the proven Tactical RMM foundation. We've replaced the frontend with React + Tailwind CSS, added AI capabilities via Groq API, and optimized for scale with Kubernetes support.

## Architecture

```
┌─────────────────────────────────────────┐
│         React Frontend                 │
│         - TypeScript                    │
│         - Tailwind CSS                  │
│         - Modern UI/UX                  │
└─────────────────┬───────────────────────┘
                  │ REST API
┌─────────────────▼───────────────────────┐
│         Django Backend                 │
│         - Proven at scale               │
│         - Tactical RMM foundation       │
└─────────────────┬───────────────────────┘
                  │ NATS / Redis
┌─────────────────▼───────────────────────┐
│         Go Agent                       │
│         - Cross-platform                │
│         - Fast & lightweight            │
└─────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+
- Python 3.11+
- Go 1.21+

### Development Setup

```bash
# Clone repository
git clone https://github.com/Derfwins/openrmm.git
cd openrmm

# Start backend services
docker-compose up -d

# Install frontend dependencies
cd frontend
npm install
npm run dev

# Access the app
# Frontend: http://localhost:5173
# Backend API: http://localhost:8000
```

## Project Structure

```
openrmm/
├── api/              # Django backend (Tactical RMM base)
├── frontend/         # React + TypeScript frontend (NEW)
├── natsapi/          # NATS message queue API
├── docker/           # Docker configurations
├── ansible/          # Deployment automation
└── .github/          # CI/CD workflows
```

## Features

### Core RMM (From Tactical RMM)
- ✅ Device discovery & management
- ✅ Remote desktop (via MeshCentral)
- ✅ Patch management
- ✅ Scripting & automation
- ✅ Multi-tenancy
- ✅ Audit logging

### New Additions
- 🆕 Modern React UI
- 🆕 AI Copilot (Groq API)
- 🆕 Kubernetes deployment
- 🆕 TimescaleDB for metrics
- 🆕 Enhanced security

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - See LICENSE.md

## Credits

Built on the excellent [Tactical RMM](https://github.com/amidaware/tacticalrmm) by Amidaware.
