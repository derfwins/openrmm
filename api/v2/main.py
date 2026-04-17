"""OpenRMM Backend - Main Application"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from v2.config import settings
from v2.database import async_engine, Base, get_db, AsyncSessionLocal
from v2.routers import auth, accounts, clients, agents, core, scripts, alerts, terminal, desktop, monitoring, audit, mesh
from sqlalchemy import select


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create all tables."""
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Create default superuser if none exists
    from v2.database import AsyncSessionLocal
    from v2.models.user import User, Role
    from v2.models.settings import CoreSettings

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.is_superuser == True))
        if not result.scalar_one_or_none():
            admin = User(username="admin", email="admin@openrmm.local", is_superuser=True, is_staff=True, is_active=True)
            admin.set_password("admin")
            db.add(admin)

            # Create default roles
            readonly = Role(name="Read Only", can_view_agent=True, can_view_client=True, can_view_checks=True, can_view_scripts=True, can_view_alerts=True)
            tech = Role(name="Technician", can_view_agent=True, can_edit_agent=True, can_deploy_agent=True, can_run_scripts_agent=True,
                        can_view_client=True, can_edit_client=True, can_view_checks=True, can_run_checks=True,
                        can_view_scripts=True, can_run_scripts=True, can_view_alerts=True)
            super_role = Role(name="Full Admin", is_superuser=True)
            db.add_all([readonly, tech, super_role])

            # Create default settings
            core_settings = CoreSettings()
            db.add(core_settings)

            await db.commit()
            print("✅ Created default admin user, roles, and settings")

    print(f"🚀 OpenRMM v{settings.APP_VERSION} starting...")
    yield
    print("👋 OpenRMM shutting down...")


app = FastAPI(
    title="OpenRMM",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=86400,
)

# Routes — routers have their own prefixes (except auth which needs /v2)
app.include_router(auth.router, prefix="/v2", tags=["Auth"])        # /v2/checkcreds/, /v2/login/
app.include_router(accounts.router, tags=["Accounts"]) # /accounts/users/, etc.
app.include_router(clients.router, tags=["Clients"])   # /clients/, etc.
app.include_router(agents.router, tags=["Agents"])     # /agents/, etc.
app.include_router(core.router, tags=["Core"])         # /core/settings/, etc.
app.include_router(scripts.router, tags=["Scripts"])   # /scripts/, etc.
app.include_router(alerts.router, tags=["Alerts"])
app.include_router(terminal.router, tags=["Terminal"])     # /alerts/, etc.
app.include_router(desktop.router, tags=["Desktop"])
app.include_router(monitoring.router, tags=["Monitoring"])
app.include_router(audit.router, tags=["Audit"])
app.include_router(mesh.router, tags=["MeshCentral"])


@app.get("/api/v1/test/")
async def test_endpoint():
    return {"status": "ok", "version": settings.APP_VERSION}


@app.get("/")
async def root():
    return {"app": "OpenRMM", "version": settings.APP_VERSION}


@app.get("/health/")
async def health_check(db: AsyncSession = Depends(get_db)):
    """System health check."""
    from v2.models.user import User
    from v2.models.client import Client
    from v2.models.agent import Agent
    from v2.models.settings import CoreSettings
    from sqlalchemy import func

    # Check database connectivity
    try:
        user_count = await db.scalar(select(func.count()).select_from(User))
        client_count = await db.scalar(select(func.count()).select_from(Client))
        agent_count = await db.scalar(select(func.count()).select_from(Agent))
        online_count = await db.scalar(select(func.count()).select_from(Agent).where(Agent.status == "online"))
    except Exception:
        return {"status": "unhealthy", "database": "error"}

    return {
        "status": "healthy",
        "database": "connected",
        "users": user_count,
        "clients": client_count,
        "agents": agent_count,
        "agents_online": online_count,
    }