from django.db import models
from django.conf import settings


class Client(models.Model):
    name = models.CharField(max_length=255)
    contact_email = models.EmailField(blank=True)

    def __str__(self):
        return self.name


class Site(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="sites")

    def __str__(self):
        return self.name


class Device(models.Model):
    STATUS_CHOICES = [
        ("online", "Online"),
        ("offline", "Offline"),
        ("warning", "Warning"),
        ("error", "Error"),
    ]
    hostname = models.CharField(max_length=255)
    os = models.CharField(max_length=128, blank=True)
    ip = models.GenericIPAddressField(blank=True, null=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="offline")
    last_seen = models.DateTimeField(blank=True, null=True)
    agent_version = models.CharField(max_length=64, blank=True)
    site = models.ForeignKey(Site, on_delete=models.SET_NULL, null=True, blank=True, related_name="devices")
    client = models.ForeignKey(Client, on_delete=models.SET_NULL, null=True, blank=True, related_name="devices")

    def __str__(self):
        return self.hostname


class Alert(models.Model):
    SEVERITY_CHOICES = [
        ("critical", "Critical"),
        ("warning", "Warning"),
        ("info", "Info"),
    ]
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="alerts")
    severity = models.CharField(max_length=16, choices=SEVERITY_CHOICES, default="info")
    message = models.TextField()
    acknowledged = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.severity}: {self.message[:50]}"


class PatchPolicy(models.Model):
    name = models.CharField(max_length=255)
    schedule = models.CharField(max_length=128, blank=True)
    targets = models.JSONField(default=list, blank=True)
    approval_required = models.BooleanField(default=False)

    def __str__(self):
        return self.name


class AutomationTask(models.Model):
    TRIGGER_CHOICES = [
        ("schedule", "Schedule"),
        ("event", "Event"),
        ("manual", "Manual"),
    ]
    name = models.CharField(max_length=255)
    trigger_type = models.CharField(max_length=16, choices=TRIGGER_CHOICES, default="manual")
    trigger_config = models.JSONField(default=dict, blank=True)
    actions = models.JSONField(default=list, blank=True)
    enabled = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Report(models.Model):
    FORMAT_CHOICES = [("pdf", "PDF"), ("csv", "CSV")]
    STATUS_CHOICES = [("pending", "Pending"), ("generating", "Generating"), ("completed", "Completed"), ("failed", "Failed")]

    type = models.CharField(max_length=64)
    date_start = models.DateField()
    date_end = models.DateField()
    filters = models.JSONField(default=dict, blank=True)
    format = models.CharField(max_length=8, choices=FORMAT_CHOICES, default="pdf")
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="pending")
    generated_at = models.DateTimeField(blank=True, null=True)
    file_path = models.CharField(max_length=512, blank=True)

    def __str__(self):
        return f"{self.type} ({self.status})"


class AuditLog(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=255)
    resource = models.CharField(max_length=255, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)

    def __str__(self):
        return f"{self.action} on {self.resource}"