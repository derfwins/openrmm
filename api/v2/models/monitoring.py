"""Monitoring system models - Probes, Sensors, Readings, Backups, Alerts."""

from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Float, Text, Boolean, DateTime, ForeignKey,
    JSON, Enum as SAEnum, BigInteger,
)
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declared_attr

from v2.database import Base


class MonitoringProbe(Base):
    __tablename__ = "monitoring_probe"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    probe_uuid = Column(String(64), unique=True, nullable=False, index=True)
    site_id = Column(Integer, ForeignKey("clients_site.id"), nullable=True)
    probe_type = Column(String(20), nullable=False, default="client")  # server / client
    ip_address = Column(String(45), nullable=True)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), nullable=False, default="offline")  # online / offline
    version = Column(String(20), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    sensors = relationship("MonitoringSensor", back_populates="probe", lazy="selectin")


class MonitoringGroup(Base):
    __tablename__ = "monitoring_group"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    site_id = Column(Integer, ForeignKey("clients_site.id"), nullable=True)
    parent_id = Column(Integer, ForeignKey("monitoring_group.id"), nullable=True)
    icon = Column(String(50), nullable=True)
    sort_order = Column(Integer, default=0)

    children = relationship("MonitoringGroup", lazy="selectin", join_depth=3)
    sensors = relationship("MonitoringSensor", back_populates="group", lazy="selectin")


class MonitoringSensor(Base):
    __tablename__ = "monitoring_sensor"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("monitoring_group.id"), nullable=True)
    probe_id = Column(Integer, ForeignKey("monitoring_probe.id"), nullable=True)
    display_name = Column(String(255), nullable=False)
    sensor_type = Column(String(30), nullable=False)  # ping/port/http/snmp_system/snmp_interface/snmp_cpu/snmp_disk/snmp_custom/dns/ssl_cert/snmp_printer/snmp_ups
    target_host = Column(String(255), nullable=False)
    target_port = Column(Integer, nullable=True)

    # SNMP config
    snmp_version = Column(String(5), default="2c")  # 1 / 2c / 3
    snmp_community = Column(String(255), default="public")
    snmp_username = Column(String(255), nullable=True)
    snmp_auth_protocol = Column(String(20), nullable=True)  # MD5 / SHA / SHA256
    snmp_auth_passphrase = Column(String(255), nullable=True)
    snmp_priv_protocol = Column(String(20), nullable=True)  # AES / DES
    snmp_priv_passphrase = Column(String(255), nullable=True)
    snmp_oid = Column(String(512), nullable=True)  # For custom SNMP sensors

    # SSH config (for network backups)
    ssh_username = Column(String(255), nullable=True)
    ssh_password_encrypted = Column(Text, nullable=True)
    ssh_enable_password_encrypted = Column(Text, nullable=True)
    ssh_vendor = Column(String(50), nullable=True)  # cisco_ios / juniper / arista / hp_aruba / mikrotik / palo_alto / fortinet / dell

    # Check config
    interval_seconds = Column(Integer, default=60)
    timeout_seconds = Column(Integer, default=5)
    threshold_warning = Column(Float, nullable=True)
    threshold_critical = Column(Float, nullable=True)

    # State
    enabled = Column(Boolean, default=True)
    paused = Column(Boolean, default=False)
    last_check = Column(DateTime(timezone=True), nullable=True)
    last_value_float = Column(Float, nullable=True)
    last_value_text = Column(String(255), nullable=True)
    status = Column(String(20), default="unknown")  # ok / warning / critical / unknown / down
    tags = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    group = relationship("MonitoringGroup", back_populates="sensors")
    probe = relationship("MonitoringProbe", back_populates="sensors")
    readings = relationship("MonitoringReading", back_populates="sensor", order_by="MonitoringReading.timestamp.desc()", lazy="dynamic")
    backups = relationship("MonitoringBackup", back_populates="sensor", order_by="MonitoringBackup.timestamp.desc()", lazy="dynamic")


class MonitoringReading(Base):
    __tablename__ = "monitoring_reading"

    id = Column(BigInteger, primary_key=True, index=True)
    sensor_id = Column(Integer, ForeignKey("monitoring_sensor.id"), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    value_float = Column(Float, nullable=True)
    value_text = Column(String(255), nullable=True)
    status = Column(String(20), nullable=False, default="ok")  # ok / warning / critical

    sensor = relationship("MonitoringSensor", back_populates="readings")


class MonitoringBackup(Base):
    __tablename__ = "monitoring_backup"

    id = Column(BigInteger, primary_key=True, index=True)
    sensor_id = Column(Integer, ForeignKey("monitoring_sensor.id"), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    config_text = Column(Text, nullable=False)
    diff_from_last = Column(Text, nullable=True)
    backup_type = Column(String(20), default="running")  # running / startup / full
    file_size = Column(Integer, nullable=True)

    sensor = relationship("MonitoringSensor", back_populates="backups")


class MonitoringAlertRule(Base):
    __tablename__ = "monitoring_alert_rule"

    id = Column(Integer, primary_key=True, index=True)
    sensor_id = Column(Integer, ForeignKey("monitoring_sensor.id"), nullable=True)  # null = global
    condition = Column(JSON, nullable=False)  # {"field": "value_float", "operator": "gt", "value": 90}
    notify_email = Column(String(255), nullable=True)
    notify_webhook = Column(String(512), nullable=True)
    cooldown_seconds = Column(Integer, default=300)
    enabled = Column(Boolean, default=True)
    last_triggered = Column(DateTime(timezone=True), nullable=True)

    sensor = relationship("MonitoringSensor")