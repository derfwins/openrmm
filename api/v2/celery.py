from celery import Celery
import os

redis_host = os.getenv("REDIS_HOST", "localhost")

app = Celery(
    "openrmm",
    broker=f"redis://{redis_host}:6379/0",
    backend=f"redis://{redis_host}:6379/1",
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)

app.autodiscover_tasks(["v2"])