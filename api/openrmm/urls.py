from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ClientViewSet,
    SiteViewSet,
    DeviceViewSet,
    AlertViewSet,
    PatchPolicyViewSet,
    AutomationTaskViewSet,
    ReportViewSet,
    AuditLogViewSet,
)

router = DefaultRouter()
router.register("clients", ClientViewSet)
router.register("sites", SiteViewSet)
router.register("devices", DeviceViewSet)
router.register("alerts", AlertViewSet)
router.register("patch-policies", PatchPolicyViewSet)
router.register("automation-tasks", AutomationTaskViewSet)
router.register("reports", ReportViewSet)
router.register("audit-logs", AuditLogViewSet)

urlpatterns = [
    path("", include(router.urls)),
]