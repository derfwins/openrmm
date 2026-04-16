"""Monitoring API - Probes, Sensors, Readings, Backups, Dashboard."""

from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from v2.database import AsyncSessionLocal
from v2.models.monitoring import (
    MonitoringProbe, MonitoringGroup, MonitoringSensor,
    MonitoringReading, MonitoringBackup, MonitoringAlertRule,
)
from v2.routers.auth import get_current_user

router = APIRouter(prefix="/monitoring", tags=["monitoring"])


# --- Pydantic Schemas ---

class ProbeCreate(BaseModel):
    name: str
    probe_uuid: str
    site_id: Optional[int] = None
    probe_type: str = "client"
    ip_address: Optional[str] = None
    version: Optional[str] = None

class ProbeOut(BaseModel):
    id: int
    name: str
    probe_uuid: str
    site_id: Optional[int]
    probe_type: str
    ip_address: Optional[str]
    last_seen: Optional[datetime]
    status: str
    version: Optional[str]
    created_at: datetime
    class Config:
        from_attributes = True

class GroupCreate(BaseModel):
    name: str
    site_id: Optional[int] = None
    parent_id: Optional[int] = None
    icon: Optional[str] = None
    sort_order: int = 0

class GroupOut(BaseModel):
    id: int
    name: str
    site_id: Optional[int]
    parent_id: Optional[int]
    icon: Optional[str]
    sort_order: int
    class Config:
        from_attributes = True

class SensorCreate(BaseModel):
    display_name: str
    sensor_type: str
    target_host: str
    target_port: Optional[int] = None
    group_id: Optional[int] = None
    probe_id: Optional[int] = None
    snmp_version: str = "2c"
    snmp_community: str = "public"
    snmp_username: Optional[str] = None
    snmp_auth_protocol: Optional[str] = None
    snmp_auth_passphrase: Optional[str] = None
    snmp_priv_protocol: Optional[str] = None
    snmp_priv_passphrase: Optional[str] = None
    snmp_oid: Optional[str] = None
    ssh_username: Optional[str] = None
    ssh_password_encrypted: Optional[str] = None
    ssh_enable_password_encrypted: Optional[str] = None
    ssh_vendor: Optional[str] = None
    interval_seconds: int = 60
    timeout_seconds: int = 5
    threshold_warning: Optional[float] = None
    threshold_critical: Optional[float] = None
    tags: list = Field(default_factory=list)

class SensorOut(BaseModel):
    id: int
    display_name: str
    sensor_type: str
    target_host: str
    target_port: Optional[int]
    group_id: Optional[int]
    probe_id: Optional[int]
    snmp_version: str
    snmp_community: str
    interval_seconds: int
    timeout_seconds: int
    threshold_warning: Optional[float]
    threshold_critical: Optional[float]
    enabled: bool
    paused: bool
    last_check: Optional[datetime]
    last_value_float: Optional[float]
    last_value_text: Optional[str]
    status: str
    tags: Optional[list]
    created_at: datetime
    class Config:
        from_attributes = True

class ReadingCreate(BaseModel):
    sensor_id: int
    value_float: Optional[float] = None
    value_text: Optional[str] = None
    status: str = "ok"

class ReadingOut(BaseModel):
    id: int
    sensor_id: int
    timestamp: datetime
    value_float: Optional[float]
    value_text: Optional[str]
    status: str
    class Config:
        from_attributes = True

class BackupCreate(BaseModel):
    config_text: str
    diff_from_last: Optional[str] = None
    backup_type: str = "running"
    file_size: Optional[int] = None

class BackupOut(BaseModel):
    id: int
    sensor_id: int
    timestamp: datetime
    diff_from_last: Optional[str]
    backup_type: str
    file_size: Optional[int]
    class Config:
        from_attributes = True

class AlertRuleCreate(BaseModel):
    sensor_id: Optional[int] = None
    condition: dict
    notify_email: Optional[str] = None
    notify_webhook: Optional[str] = None
    cooldown_seconds: int = 300
    enabled: bool = True

class DashboardOut(BaseModel):
    total_sensors: int
    sensors_ok: int
    sensors_warning: int
    sensors_critical: int
    sensors_unknown: int
    sensors_down: int
    total_probes: int
    probes_online: int
    top_issues: list


# --- DB Dependency ---

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# --- Probes ---

@router.get("/probes/", response_model=list[ProbeOut])
async def list_probes(db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(MonitoringProbe).order_by(MonitoringProbe.name))
    return result.scalars().all()

@router.post("/probes/", response_model=ProbeOut, status_code=201)
async def register_probe(data: ProbeCreate, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    existing = await db.execute(select(MonitoringProbe).where(MonitoringProbe.probe_uuid == data.probe_uuid))
    probe = existing.scalar_one_or_none()
    if probe:
        probe.last_seen = datetime.now(timezone.utc)
        probe.status = "online"
        probe.ip_address = data.ip_address or probe.ip_address
        probe.version = data.version or probe.version
        await db.commit()
        await db.refresh(probe)
        return probe
    probe = MonitoringProbe(**data.model_dump(), status="online", last_seen=datetime.now(timezone.utc))
    db.add(probe)
    await db.commit()
    await db.refresh(probe)
    return probe

@router.get("/probes/{probe_id}", response_model=ProbeOut)
async def get_probe(probe_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(MonitoringProbe).where(MonitoringProbe.id == probe_id))
    probe = result.scalar_one_or_none()
    if not probe:
        raise HTTPException(404, "Probe not found")
    return probe

@router.delete("/probes/{probe_id}", status_code=204)
async def delete_probe(probe_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(MonitoringProbe).where(MonitoringProbe.id == probe_id))
    probe = result.scalar_one_or_none()
    if not probe:
        raise HTTPException(404, "Probe not found")
    await db.delete(probe)
    await db.commit()


# --- Groups ---

@router.get("/groups/", response_model=list[GroupOut])
async def list_groups(db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(MonitoringGroup).order_by(MonitoringGroup.sort_order, MonitoringGroup.name))
    return result.scalars().all()

@router.post("/groups/", response_model=GroupOut, status_code=201)
async def create_group(data: GroupCreate, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    group = MonitoringGroup(**data.model_dump())
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


# --- Sensors ---

@router.get("/sensors/", response_model=list[SensorOut])
async def list_sensors(
    status: Optional[str] = None,
    sensor_type: Optional[str] = None,
    group_id: Optional[int] = None,
    probe_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    q = select(MonitoringSensor)
    if status:
        q = q.where(MonitoringSensor.status == status)
    if sensor_type:
        q = q.where(MonitoringSensor.sensor_type == sensor_type)
    if group_id:
        q = q.where(MonitoringSensor.group_id == group_id)
    if probe_id:
        q = q.where(MonitoringSensor.probe_id == probe_id)
    q = q.order_by(MonitoringSensor.display_name)
    result = await db.execute(q)
    return result.scalars().all()

@router.post("/sensors/", response_model=SensorOut, status_code=201)
async def create_sensor(data: SensorCreate, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    sensor = MonitoringSensor(**data.model_dump())
    db.add(sensor)
    await db.commit()
    await db.refresh(sensor)
    return sensor

@router.get("/sensors/{sensor_id}", response_model=SensorOut)
async def get_sensor(sensor_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(MonitoringSensor).where(MonitoringSensor.id == sensor_id))
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(404, "Sensor not found")
    return sensor

@router.put("/sensors/{sensor_id}", response_model=SensorOut)
async def update_sensor(sensor_id: int, data: SensorCreate, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(MonitoringSensor).where(MonitoringSensor.id == sensor_id))
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(404, "Sensor not found")
    for k, v in data.model_dump().items():
        setattr(sensor, k, v)
    await db.commit()
    await db.refresh(sensor)
    return sensor

@router.delete("/sensors/{sensor_id}", status_code=204)
async def delete_sensor(sensor_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(MonitoringSensor).where(MonitoringSensor.id == sensor_id))
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(404, "Sensor not found")
    await db.delete(sensor)
    await db.commit()

@router.post("/sensors/{sensor_id}/pause/", response_model=SensorOut)
async def pause_sensor(sensor_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(MonitoringSensor).where(MonitoringSensor.id == sensor_id))
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(404, "Sensor not found")
    sensor.paused = True
    await db.commit()
    await db.refresh(sensor)
    return sensor

@router.post("/sensors/{sensor_id}/resume/", response_model=SensorOut)
async def resume_sensor(sensor_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(MonitoringSensor).where(MonitoringSensor.id == sensor_id))
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(404, "Sensor not found")
    sensor.paused = False
    await db.commit()
    await db.refresh(sensor)
    return sensor

@router.get("/sensors/{sensor_id}/history/", response_model=list[ReadingOut])
async def sensor_history(
    sensor_id: int,
    hours: int = Query(24, ge=1, le=720),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = await db.execute(
        select(MonitoringReading)
        .where(and_(MonitoringReading.sensor_id == sensor_id, MonitoringReading.timestamp >= since))
        .order_by(desc(MonitoringReading.timestamp))
        .limit(1440)
    )
    return result.scalars().all()


# --- Readings ---

@router.post("/readings/", response_model=ReadingOut, status_code=201)
async def submit_reading(data: ReadingCreate, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    # Also update sensor's last_check, last_value, status
    sensor_result = await db.execute(select(MonitoringSensor).where(MonitoringSensor.id == data.sensor_id))
    sensor = sensor_result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(404, "Sensor not found")

    now = datetime.now(timezone.utc)
    reading = MonitoringReading(
        sensor_id=data.sensor_id,
        value_float=data.value_float,
        value_text=data.value_text,
        status=data.status,
        timestamp=now,
    )
    db.add(reading)

    sensor.last_check = now
    sensor.last_value_float = data.value_float
    sensor.last_value_text = data.value_text
    sensor.status = data.status

    await db.commit()
    await db.refresh(reading)
    return reading


# --- Dashboard ---

@router.get("/dashboard/", response_model=DashboardOut)
async def monitoring_dashboard(db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    total = await db.execute(select(func.count()).select_from(MonitoringSensor))
    by_status = await db.execute(
        select(MonitoringSensor.status, func.count())
        .group_by(MonitoringSensor.status)
    )
    status_counts = dict(by_status.all())

    probe_total = await db.execute(select(func.count()).select_from(MonitoringProbe))
    probe_online = await db.execute(
        select(func.count()).select_from(MonitoringProbe).where(MonitoringProbe.status == "online")
    )

    # Top issues = critical + warning sensors
    issues = await db.execute(
        select(MonitoringSensor)
        .where(MonitoringSensor.status.in_(["critical", "warning"]))
        .order_by(MonitoringSensor.last_check.desc())
        .limit(10)
    )
    top_issues = [
        {
            "sensor_id": s.id,
            "display_name": s.display_name,
            "status": s.status,
            "last_value_text": s.last_value_text,
        }
        for s in issues.scalars().all()
    ]

    return DashboardOut(
        total_sensors=total.scalar() or 0,
        sensors_ok=status_counts.get("ok", 0),
        sensors_warning=status_counts.get("warning", 0),
        sensors_critical=status_counts.get("critical", 0),
        sensors_unknown=status_counts.get("unknown", 0),
        sensors_down=status_counts.get("down", 0),
        total_probes=probe_total.scalar() or 0,
        probes_online=probe_online.scalar() or 0,
        top_issues=top_issues,
    )


# --- Backups ---

@router.get("/backups/{sensor_id}/", response_model=list[BackupOut])
async def list_backups(sensor_id: int, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(
        select(MonitoringBackup)
        .where(MonitoringBackup.sensor_id == sensor_id)
        .order_by(desc(MonitoringBackup.timestamp))
        .limit(50)
    )
    return result.scalars().all()

@router.post("/backups/{sensor_id}/", response_model=BackupOut, status_code=201)
async def store_backup(sensor_id: int, data: BackupCreate, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    sensor_result = await db.execute(select(MonitoringSensor).where(MonitoringSensor.id == sensor_id))
    sensor = sensor_result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(404, "Sensor not found")
    backup = MonitoringBackup(sensor_id=sensor_id, **data.model_dump())
    db.add(backup)
    await db.commit()
    await db.refresh(backup)
    return backup

@router.get("/backups/{sensor_id}/diff/")
async def backup_diff(
    sensor_id: int,
    from_id: int = Query(...),
    to_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result_a = await db.execute(select(MonitoringBackup).where(MonitoringBackup.id == from_id))
    result_b = await db.execute(select(MonitoringBackup).where(MonitoringBackup.id == to_id))
    a = result_a.scalar_one_or_none()
    b = result_b.scalar_one_or_none()
    if not a or not b:
        raise HTTPException(404, "Backup not found")
    return {"from": a.config_text, "to": b.config_text}


# --- Alert Rules ---

@router.get("/alert-rules/", response_model=list[AlertRuleCreate])
async def list_alert_rules(db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(select(MonitoringAlertRule))
    rules = result.scalars().all()
    return [
        {
            "sensor_id": r.sensor_id,
            "condition": r.condition,
            "notify_email": r.notify_email,
            "notify_webhook": r.notify_webhook,
            "cooldown_seconds": r.cooldown_seconds,
            "enabled": r.enabled,
        }
        for r in rules
    ]

@router.post("/alert-rules/", status_code=201)
async def create_alert_rule(data: AlertRuleCreate, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    rule = MonitoringAlertRule(**data.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {"id": rule.id}

# --- Auto-Discovery ---

class DiscoverRequest(BaseModel):
    target_host: str
    snmp_community: str = "public"
    snmp_version: str = "2c"

class DiscoveredSensor(BaseModel):
    sensor_type: str
    display_name: str
    target_host: str
    description: str
    auto_create: bool = True

class DiscoverResult(BaseModel):
    alive: bool
    latency_ms: Optional[float] = None
    device_type: Optional[str] = None  # cisco, juniper, hp, windows, linux, printer, ups, etc.
    sys_descr: Optional[str] = None
    sys_name: Optional[str] = None
    suggested_sensors: list[DiscoveredSensor] = []

@router.post("/discover/", response_model=DiscoverResult)
async def discover_device(data: DiscoverRequest, _user=Depends(get_current_user)):
    """Probe a device and auto-suggest sensors based on what's found."""
    import subprocess
    import asyncio

    result = DiscoverResult(alive=False)

    # 1. Ping check
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping", "-c", "1", "-W", "2", data.target_host,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        await asyncio.wait_for(proc.wait(), timeout=3)
        result.alive = (proc.returncode == 0)
    except Exception:
        pass

    # 2. SNMP sysDescr walk
    snmp_ok = False
    try:
        proc = await asyncio.create_subprocess_exec(
            "snmpwalk", "-v", data.snmp_version, "-c", data.snmp_community,
            data.target_host, "1.3.6.1.2.1.1", "-O", "q",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
        if proc.returncode == 0 and stdout:
            snmp_ok = True
            output = stdout.decode("utf-8", errors="ignore")
            lines = output.strip().split("\n")

            for line in lines:
                if "1.3.6.1.2.1.1.1.0" in line or "sysDescr" in line:
                    result.sys_descr = line.split('"', 1)[-1].rstrip('"') if '"' in line else line.split("=", 1)[-1].strip()
                elif "1.3.6.1.2.1.1.5.0" in line or "sysName" in line:
                    result.sys_name = line.split('"', 1)[-1].rstrip('"') if '"' in line else line.split("=", 1)[-1].strip()

            # Classify device from sysDescr
            descr_lower = (result.sys_descr or "").lower()
            if any(k in descr_lower for k in ["cisco", "ios", "nx-os"]):
                result.device_type = "cisco"
            elif "juniper" in descr_lower or "junos" in descr_lower:
                result.device_type = "juniper"
            elif "arista" in descr_lower:
                result.device_type = "arista"
            elif "hp " in descr_lower or "aruba" in descr_lower or "procurve" in descr_lower:
                result.device_type = "hp_aruba"
            elif "mikrotik" in descr_lower or "routeros" in descr_lower:
                result.device_type = "mikrotik"
            elif "ubiquiti" in descr_lower or "edgeswitch" in descr_lower:
                result.device_type = "ubiquiti"
            elif "palo alto" in descr_lower or "pan-os" in descr_lower:
                result.device_type = "palo_alto"
            elif "fortigate" in descr_lower or "fortinet" in descr_lower:
                result.device_type = "fortinet"
            elif "dell" in descr_lower or "powerconnect" in descr_lower or "os10" in descr_lower:
                result.device_type = "dell"
            elif "windows" in descr_lower:
                result.device_type = "windows"
            elif "linux" in descr_lower or "net-snmp" in descr_lower:
                result.device_type = "linux"
            elif any(k in descr_lower for k in ["printer", "laserjet", "ricoh", "xerox", "brother", "canon"]):
                result.device_type = "printer"
            elif any(k in descr_lower for k in ["apc", "cyberpower", "eaton", "ups"]):
                result.device_type = "ups"
            elif "synology" in descr_lower:
                result.device_type = "synology"
            elif "qnap" in descr_lower:
                result.device_type = "qnap"
            elif descr_lower:
                result.device_type = "snmp_device"

    except Exception:
        pass

    # 3. Suggest sensors based on discovery
    host = data.target_host
    name = result.sys_name or host
    dtype = result.device_type

    # Always suggest ping if alive
    if result.alive:
        result.suggested_sensors.append(DiscoveredSensor(
            sensor_type="ping", display_name=f"{name} - Ping",
            target_host=host, description="ICMP ping response time",
        ))

    if snmp_ok:
        result.suggested_sensors.append(DiscoveredSensor(
            sensor_type="snmp_system", display_name=f"{name} - System",
            target_host=host, description="SNMP system info (uptime, hostname, contact)",
        ))

        # Network devices get interface monitoring
        if dtype in ("cisco", "juniper", "arista", "hp_aruba", "mikrotik", "ubiquiti", "dell", "palo_alto", "fortinet", "snmp_device"):
            result.suggested_sensors.append(DiscoveredSensor(
                sensor_type="snmp_interface", display_name=f"{name} - Interfaces",
                target_host=host, description="SNMP interface bandwidth (in/out bps, errors)",
            ))

        # Network devices get CPU/memory
        if dtype in ("cisco", "juniper", "arista", "hp_aruba", "palo_alto", "fortinet"):
            result.suggested_sensors.append(DiscoveredSensor(
                sensor_type="snmp_cpu", display_name=f"{name} - CPU",
                target_host=host, description="SNMP device CPU utilization",
            ))
            result.suggested_sensors.append(DiscoveredSensor(
                sensor_type="snmp_disk", display_name=f"{name} - Memory",
                target_host=host, description="SNMP device memory usage",
            ))

        # Printers
        if dtype == "printer":
            result.suggested_sensors.append(DiscoveredSensor(
                sensor_type="snmp_printer", display_name=f"{name} - Printer Status",
                target_host=host, description="Toner levels, paper status, tray info",
            ))

        # UPS
        if dtype == "ups":
            result.suggested_sensors.append(DiscoveredSensor(
                sensor_type="snmp_ups", display_name=f"{name} - UPS Status",
                target_host=host, description="Battery, input/output power, runtime",
            ))

        # Servers
        if dtype in ("windows", "linux"):
            result.suggested_sensors.append(DiscoveredSensor(
                sensor_type="snmp_cpu", display_name=f"{name} - CPU",
                target_host=host, description="SNMP CPU utilization",
            ))
            result.suggested_sensors.append(DiscoveredSensor(
                sensor_type="snmp_disk", display_name=f"{name} - Disk/Memory",
                target_host=host, description="SNMP storage and memory usage",
            ))

    elif result.alive:
        # No SNMP - just basic checks
        result.suggested_sensors.append(DiscoveredSensor(
            sensor_type="port", display_name=f"{name} - HTTP",
            target_host=host, description="HTTP(S) check on port 80/443",
        ))

    return result
