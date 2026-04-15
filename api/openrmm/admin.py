from django.contrib import admin
from .models import Client, Site, Device, Alert, PatchPolicy, AutomationTask, Report, AuditLog

admin.site.register(Client)
admin.site.register(Site)
admin.site.register(Device)
admin.site.register(Alert)
admin.site.register(PatchPolicy)
admin.site.register(AutomationTask)
admin.site.register(Report)
admin.site.register(AuditLog)