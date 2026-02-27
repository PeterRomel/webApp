# app/tasks/cleanup_tasks.py
import os
from datetime import datetime, timedelta, timezone
from sqlmodel import Session, select, delete
from app.db.engine import engine
from app.models.scraper import ScrapeJob
from app.models.user import User

def clear_old_data():
    with Session(engine) as session:
        # --- 1. Delete Jobs older than 30 days ---
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        
        # This deletes everything in one single SQL command
        statement = delete(ScrapeJob).where(ScrapeJob.created_at < thirty_days_ago)
        session.exec(statement)
    
        """
        # --- 2. Delete Orphaned Jobs (Users that don't exist) ---
        # We find jobs where the user_id is not in the User table
        all_user_ids = session.exec(select(User.id)).all()
        orphan_stmt = select(ScrapeJob).where(ScrapeJob.user_id.notin_(all_user_ids))
        orphans = session.exec(orphan_stmt).all()
        
        for job in orphans:
            session.delete(job) 
        """
            
        session.commit()
        return f"Cleaned all old jobs before {thirty_days_ago}."