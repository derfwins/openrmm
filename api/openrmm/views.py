from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import FileResponse
from .models import Client, Site, Device, Alert, PatchPolicy, AutomationTask, Report, AuditLog
from .serializers import (
    ClientSerializer,
    SiteSerializer,
    DeviceSerializer,
    AlertSerializer,
    PatchPolicySerializer,
    AutomationTaskSerializer,
    ReportSerializer,
    AuditLogSerializer,
)


class ClientViewSet(viewsets.ModelViewSet):
    queryset = Client.objects.all()
    serializer_class = ClientSerializer


class SiteViewSet(viewsets.ModelViewSet):
    queryset = Site.objects.all()
    serializer_class = SiteSerializer


class DeviceViewSet(viewsets.ModelViewSet):
    queryset = Device.objects.all()
    serializer_class = DeviceSerializer


class AlertViewSet(viewsets.ModelViewSet):
    queryset = Alert.objects.all()
    serializer_class = AlertSerializer


class PatchPolicyViewSet(viewsets.ModelViewSet):
    queryset = PatchPolicy.objects.all()
    serializer_class = PatchPolicySerializer


class AutomationTaskViewSet(viewsets.ModelViewSet):
    queryset = AutomationTask.objects.all()
    serializer_class = AutomationTaskSerializer


class ReportViewSet(viewsets.ModelViewSet):
    queryset = Report.objects.all()
    serializer_class = ReportSerializer

    @action(detail=True, methods=["post"])
    def generate(self, request, pk=None):
        """Trigger report generation (placeholder for async processing)."""
        report = self.get_object()
        report.status = "completed"
        report.generated_at = report.date_start  # placeholder
        report.save()
        return Response(ReportSerializer(report).data)

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        report = self.get_object()
        if not report.file_path:
            return Response({"error": "File not available"}, status=status.HTTP_404_NOT_FOUND)
        return FileResponse(open(report.file_path, "rb"))


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer