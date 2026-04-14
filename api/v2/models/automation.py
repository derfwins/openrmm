"""Automation model - scheduled tasks and policies"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from v2.database import Base


class AutomatedTask(Base):
    __tablename__ = "automation_task"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    task_type = Column(String(50), default="scheduled", server_default="scheduled")  # scheduled, check, policy
    script_id = Column(Integer, ForeignKey("scripts_script.id", ondelete="SET NULL"), nullable=True)
    agent_id = Column(Integer, ForeignKey("agents_agent.id", ondelete="CASCADE"), nullable=True)
    client_id = Column(Integer, ForeignKey("clients_client.id", ondelete="CASCADE"), nullable=True)
    site_id = Column(Integer, ForeignKey("clients_site.id", ondelete="CASCADE"), nullable=True)

    # Schedule
    schedule = Column(String(100), default="", server_default="")  # cron expression or interval
    run_days = Column(Integer, default=127, server_default="127")  # bitmask: Mon=1..Sun=64, all=127
    run_time = Column(String(10), default="12:00", server_default="12:00")  # HH:MM
    timeout = Column(Integer, default=300, server_default="300")

    # Status
    is_active = Column(Boolean, default=True, server_default="true")
    last_run = Column(DateTime, nullable=True)
    next_run = Column(DateTime, nullable=True)
    last_result = Column(Text, default="", server_default="")
    status = Column(String(50), default="pending", server_default="pending")  # pending, running, completed, failed

    created_by = Column(String(255), default="", server_default="")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Policy(Base):
    __tablename__ = "automation_policy"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="", server_default="")
    is_active = Column(Boolean, default=True, server_default="true")
    client_id = Column(Integer, ForeignKey("clients_client.id", ondelete="SET NULL"), nullable=True)
    site_id = Column(Integer, ForeignKey("clients_site.id", ondelete="SET NULL"), nullable=True)

    # Policy data (checks, scripts, tasks to apply)
    policy_data = Column(JSON, default=dict, server_default="{}")

    created_by = Column(String(255), default="", server_default="")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())