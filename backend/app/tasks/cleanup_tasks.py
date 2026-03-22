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
        # --- 1. Delete Jobs older than 30 days ---
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        
        # This deletes everything in one single SQL command
        statement = delete(ScrapeJob).where(ScrapeJob.created_at < thirty_days_ago)
        session.exec(statement)
            
        session.commit()
        return f"Cleaned all old jobs before {thirty_days_ago}."