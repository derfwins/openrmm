"""Clients & Sites endpoints"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from v2.database import get_db
from v2.models.user import User
from v2.models.client import Client, Site
from v2.auth import get_current_user

router = APIRouter(prefix="/clients")


class ClientCreate(BaseModel):
    client: dict  # {"name": "Client Name"}
    site: dict     # {"name": "Site Name"}


class SiteCreate(BaseModel):
    site: dict     # {"client": ID, "name": "Site Name"}


@router.get("/")
async def list_clients(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Fetch clients
    result = await db.execute(select(Client))
    clients = result.scalars().all()
    # Fetch sites separately
    sites_result = await db.execute(select(Site))
    sites = sites_result.scalars().all()
    # Group sites by client_id
    sites_by_client = {}
    for s in sites:
        sites_by_client.setdefault(s.client_id, []).append({"id": s.id, "name": s.name, "client": s.client_id})
    return [
        {
            "id": c.id,
            "name": c.name,
            "sites": sites_by_client.get(c.id, []),
        }
        for c in clients
    ]


@router.post("/")
async def create_client(req: ClientCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    client_name = req.client.get("name", "").strip()
    site_name = req.site.get("name", "").strip()
    if not client_name:
        raise HTTPException(400, detail="Client name is required")

    client = Client(name=client_name)
    db.add(client)
    await db.flush()

    if site_name:
        site = Site(name=site_name, client_id=client.id)
        db.add(site)

    from v2.audit import log_action
    await log_action(db, username=user.username, action="create", resource_type="client", resource_id=str(client.id), description=f"Created client '{client_name}'")
    await db.commit()
    await db.refresh(client)
    return {"id": client.id, "name": client.name}


@router.delete("/{pk}/")
async def delete_client(pk: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Client).where(Client.id == pk))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(404, detail="Client not found")
    await db.delete(client)
    await db.commit()
    return "ok"


# === Sites ===

@router.get("/sites/")
async def list_sites(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Site))
    sites = result.scalars().all()
    return [
        {"id": s.id, "name": s.name, "client": s.client_id}
        for s in sites
    ]


@router.post("/sites/")
async def create_site(req: SiteCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    client_id = req.site.get("client")
    site_name = req.site.get("name", "").strip()
    if not client_id or not site_name:
        raise HTTPException(400, detail="Client ID and site name are required")

    # Verify client exists
    result = await db.execute(select(Client).where(Client.id == client_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, detail="Client not found")

    site = Site(name=site_name, client_id=client_id)
    db.add(site)
    await db.commit()
    await db.refresh(site)
    return {"id": site.id, "name": site.name}


@router.delete("/sites/{pk}/")
async def delete_site(pk: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Site).where(Site.id == pk))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(404, detail="Site not found")
    await db.delete(site)
    await db.commit()
    return "ok"


@router.get("/{client_id}/sites/")
async def get_client_sites(client_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Site).where(Site.client_id == client_id))
    sites = result.scalars().all()
    return [{"id": s.id, "name": s.name, "client_id": s.client_id} for s in sites]


@router.get("/{client_id}/agents/")
async def get_client_agents(client_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from v2.models.agent import Agent
    site_result = await db.execute(select(Site.id).where(Site.client_id == client_id))
    site_ids = [row[0] for row in site_result.all()]
    if not site_ids:
        return []
    result = await db.execute(select(Agent).where(Agent.site_id.in_(site_ids)))
    agents = result.scalars().all()
    return [
        {
            "id": a.id, "hostname": a.hostname, "agent_id": a.agent_id,
            "site_id": a.site_id, "status": a.status, "plat": a.plat,
            "last_seen": a.last_seen.isoformat() if a.last_seen else None,
            "local_ip": a.local_ip, "os_name": a.os_name,
        }
        for a in agents
    ]