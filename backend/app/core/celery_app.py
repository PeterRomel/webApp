# app/core/celery_app.py
from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "worker",
    broker=settings.REDIS_URL_CELERY,
    backend=settings.REDIS_URL_CELERY,
    include=[
        "app.tasks.scraper_tasks", 
        "app.tasks.cleanup_tasks" # Include your new cleanup file
    ]
)

# Set up the Schedule (Beat)
celery_app.conf.beat_schedule = {
    "cleanup-database-every-night": {
        "task": "app.tasks.cleanup_tasks.clear_old_data",
        "schedule": crontab(hour=0, minute=0), # Runs every night at Midnight
    },
}

# Optional but good practice
celery_app.conf.update(
    task_track_started=True,
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
)