"""Agent management models"""
from django.db import models
import uuid


class Agent(models.Model):
    """Registered RMM agent."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    agent_id = models.CharField(max_length=255, unique=True, db_index=True)
    hostname = models.CharField(max_length=255)

    # Connection info
    site_id = models.IntegerField(null=True, blank=True)
    client_id = models.IntegerField(null=True, blank=True)
    version = models.CharField(max_length=50, default="")
    operating_system = models.CharField(max_length=255, default="")
    plat = models.CharField(max_length=50, default="")  # windows, linux, darwin
    goarch = models.CharField(max_length=50, default="")  # amd64, arm64

    # Status
    status = models.CharField(max_length=50, default="offline")  # online, offline, overdue
    last_seen = models.DateTimeField(null=True, blank=True)
    first_seen = models.DateTimeField(auto_now_add=True)
    last_heartbeat = models.DateTimeField(null=True, blank=True)

    # Monitoring
    monitoring_type = models.CharField(max_length=50, default="server")
    description = models.TextField(default="", blank=True)
    mesh_node_id = models.CharField(max_length=255, default="", blank=True)

    # Settings
    is_maintenance = models.BooleanField(default=False)
    secret = models.CharField(max_length=255, default="", blank=True)  # Agent auth secret

    # System info (updated by agent)
    cpu_model = models.CharField(max_length=255, default="", blank=True)
    cpu_cores = models.IntegerField(default=0)
    total_ram = models.FloatField(default=0)
    os_name = models.CharField(max_length=255, default="", blank=True)
    os_version = models.CharField(max_length=255, default="", blank=True)
    public_ip = models.CharField(max_length=50, default="", blank=True)
    local_ip = models.CharField(max_length=50, default="", blank=True)
    logged_in_user = models.CharField(max_length=255, default="", blank=True)

    class Meta:
        db_table = "agents_agent"
        ordering = ["-last_seen"]

    def __str__(self):
        return f"{self.hostname} ({self.agent_id})"


class AgentCommand(models.Model):
    """Command sent to an agent."""
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("running", "Running"),
        ("completed", "Completed"),
        ("failed", "Failed"),
        ("timeout", "Timeout"),
    ]
    SHELL_CHOICES = [
        ("powershell", "PowerShell"),
        ("bash", "Bash"),
        ("python", "Python"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="commands")
    command = models.TextField()
    shell = models.CharField(max_length=20, choices=SHELL_CHOICES, default="powershell")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    output = models.TextField(default="", blank=True)
    run_by = models.CharField(max_length=255, default="", blank=True)
    timeout = models.IntegerField(default=300)  # seconds
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "agents_command"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Command {self.id} -> {self.agent.hostname}"


class AgentService(models.Model):
    """Service running on an agent."""
    STATUS_CHOICES = [
        ("running", "Running"),
        ("stopped", "Stopped"),
        ("paused", "Paused"),
    ]
    START_TYPE_CHOICES = [
        ("auto", "Auto"),
        ("manual", "Manual"),
        ("disabled", "Disabled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="services")
    name = models.CharField(max_length=255)
    display_name = models.CharField(max_length=255, default="", blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="stopped")
    start_type = models.CharField(max_length=20, choices=START_TYPE_CHOICES, default="manual")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "agents_service"
        unique_together = ["agent", "name"]