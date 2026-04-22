# app/tasks/cleanup_tasks.py
import os, time
from datetime import datetime, timedelta, timezone
from sqlmodel import Session, select, delete
from app.db.engine import engine
from app.models.scraper import ScrapeJob
from app.models.user import User
from app.core.celery_app import celery_app
from app.core.config import settings

@celery_app.task(name="app.tasks.cleanup_tasks.clear_old_data")
def clear_old_data():
    upload_dir = settings.UPLOAD_DIR
    current_time = time.time()
    if os.path.exists(upload_dir):
        for filename in os.listdir(upload_dir):
            file_path = os.path.join(upload_dir, filename)
            # Delete files older than 24 hours
            if os.path.isfile(file_path) and os.stat(file_path).st_mtime < current_time - 86400:
                os.remove(file_path)
    
    with Session(engine) as session:
        # 1. Catch jobs stuck in processing for more than 12 hours
        twelve_hours_ago = datetime.now(timezone.utc) - timedelta(hours=12)
        statement = select(ScrapeJob).where(
            ScrapeJob.status.in_(["pending", "processing"]),
            ScrapeJob.created_at < twelve_hours_ago
        )
        stuck_jobs = session.exec(statement).all()
        
        for job in stuck_jobs:
            job.status = "failed"
            job.error_message = "Job timed out or worker crashed unexpectedly."
            session.add(job)

        # 2. Delete Jobs older than 30 days (Your existing code)
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        delete_stmt = delete(ScrapeJob).where(ScrapeJob.created_at < thirty_days_ago)
        session.exec(delete_stmt)
            
        session.commit()
        return f"Cleaned {len(stuck_jobs)} stuck jobs, and deleted jobs older than 30 days."