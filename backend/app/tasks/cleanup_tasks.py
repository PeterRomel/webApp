# app/tasks/cleanup_tasks.py
import os, time
from datetime import datetime, timedelta, timezone
from sqlmodel import Session, select, delete
from app.db.engine import engine
from app.models.scraper import ScrapeJob
from app.core.celery_app import celery_app
from app.core.config import settings
from googleapiclient.discovery import build

# NEW: Import the OAuth Credentials library
from google.oauth2.credentials import Credentials
from app.core.logger_config import APP_LOGGER


@celery_app.task(name="app.tasks.cleanup_tasks.clear_old_data")
def clear_old_data():
    upload_dir = settings.UPLOAD_DIR
    current_time = time.time()
    if os.path.exists(upload_dir):
        for filename in os.listdir(upload_dir):
            file_path = os.path.join(upload_dir, filename)
            # Delete files older than 24 hours
            if (
                os.path.isfile(file_path)
                and os.stat(file_path).st_mtime < current_time - 86400
            ):
                os.remove(file_path)

    with Session(engine) as session:
        twelve_hours_ago = datetime.now(timezone.utc) - timedelta(hours=12)
        statement = select(ScrapeJob).where(
            ScrapeJob.status == "pending",
            ScrapeJob.created_at < twelve_hours_ago,
        )
        stuck_jobs = session.exec(statement).all()

        for job in stuck_jobs:
            job.status = "failed"
            job.error_message = "Job timed out or worker crashed unexpectedly."
            session.add(job)

        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        delete_stmt = delete(ScrapeJob).where(ScrapeJob.created_at < thirty_days_ago)
        session.exec(delete_stmt)
        session.commit()

    # Cleanup Orphaned Google Sheets via OAuth Token
    try:
        if os.path.exists(settings.GOOGLE_OAUTH_TOKEN_FILE):
            creds = Credentials.from_authorized_user_file(
                settings.GOOGLE_OAUTH_TOKEN_FILE
            )
            drive_api = build("drive", "v3", credentials=creds)

            twelve_hours_ago_str = (
                datetime.now(timezone.utc) - timedelta(hours=12)
            ).strftime("%Y-%m-%dT%H:%M:%SZ")

            query = f"createdTime < '{twelve_hours_ago_str}' and mimeType='application/vnd.google-apps.spreadsheet'"

            # SAFETY FIX: Increased pageSize to 1000
            results = (
                drive_api.files()
                .list(q=query, pageSize=1000, fields="files(id, name)")
                .execute()
            )
            files = results.get("files", [])

            for file in files:
                drive_api.files().delete(fileId=file["id"]).execute()
                time.sleep(0.5)  # Prevent 429 Rate Limits!

            APP_LOGGER.info(f"Cleaned {len(files)} orphaned Google Sheets.")
    except Exception as e:
        APP_LOGGER.error(f"Google Drive Cleanup Failed: {e}")

    return f"Cleaned {len(stuck_jobs)} stuck jobs, and deleted jobs older than 30 days."
