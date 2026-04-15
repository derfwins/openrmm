"""OpenRMM Agents Django App - Agent Management API"""
from django.apps import AppConfig


class AgentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "agents"
    verbose_name = "Agent Management"