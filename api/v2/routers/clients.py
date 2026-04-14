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