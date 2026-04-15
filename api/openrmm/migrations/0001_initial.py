import datetime
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Client",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("contact_email", models.EmailField(blank=True)),
            ],
        ),
        migrations.CreateModel(
            name="Site",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("client", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sites", to="openrmm.client")),
            ],
        ),
        migrations.CreateModel(
            name="PatchPolicy",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("schedule", models.CharField(blank=True, max_length=128)),
                ("targets", models.JSONField(blank=True, default=list)),
                ("approval_required", models.BooleanField(default=False)),
            ],
        ),
        migrations.CreateModel(
            name="AutomationTask",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("trigger_type", models.CharField(choices=[("schedule", "Schedule"), ("event", "Event"), ("manual", "Manual")], default="manual", max_length=16)),
                ("trigger_config", models.JSONField(blank=True, default=dict)),
                ("actions", models.JSONField(blank=True, default=list)),
                ("enabled", models.BooleanField(default=True)),
            ],
        ),
        migrations.CreateModel(
            name="AuditLog",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("action", models.CharField(max_length=255)),
                ("resource", models.CharField(blank=True, max_length=255)),
                ("timestamp", models.DateTimeField(auto_now_add=True)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
            ],
        ),
        migrations.CreateModel(
            name="Device",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("hostname", models.CharField(max_length=255)),
                ("os", models.CharField(blank=True, max_length=128)),
                ("ip", models.GenericIPAddressField(blank=True, null=True)),
                ("status", models.CharField(choices=[("online", "Online"), ("offline", "Offline"), ("warning", "Warning"), ("error", "Error")], default="offline", max_length=16)),
                ("last_seen", models.DateTimeField(blank=True, null=True)),
                ("agent_version", models.CharField(blank=True, max_length=64)),
                ("client", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="devices", to="openrmm.client")),
                ("site", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="devices", to="openrmm.site")),
            ],
        ),
        migrations.CreateModel(
            name="Alert",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("severity", models.CharField(choices=[("critical", "Critical"), ("warning", "Warning"), ("info", "Info")], default="info", max_length=16)),
                ("message", models.TextField()),
                ("acknowledged", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("device", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="alerts", to="openrmm.device")),
            ],
        ),
        migrations.CreateModel(
            name="Report",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("type", models.CharField(max_length=64)),
                ("date_start", models.DateField()),
                ("date_end", models.DateField()),
                ("filters", models.JSONField(blank=True, default=dict)),
                ("format", models.CharField(choices=[("pdf", "PDF"), ("csv", "CSV")], default="pdf", max_length=8)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("generating", "Generating"), ("completed", "Completed"), ("failed", "Failed")], default="pending", max_length=16)),
                ("generated_at", models.DateTimeField(blank=True, null=True)),
                ("file_path", models.CharField(blank=True, max_length=512)),
            ],
        ),
        migrations.AddField(
            model_name="auditlog",
            name="user",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="auth.user"),
        ),
    ]