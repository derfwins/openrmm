from rest_framework import serializers
from .models import Client, Site, Device, Alert, PatchPolicy, AutomationTask, Report, AuditLog


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = "__all__"


class SiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = "__all__"


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = "__all__"


class AlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = Alert
        fields = "__all__"


class PatchPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = PatchPolicy
        fields = "__all__"


class AutomationTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = AutomationTask
        fields = "__all__"


class ReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = "__all__"


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = "__all__"