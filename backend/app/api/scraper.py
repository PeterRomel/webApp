# app/api/scraper.py
import os
import io
import uuid
import shutil
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
import tempfile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from sqlmodel import Session
from app.db.engine import get_session
from app.models.scraper import ScrapeJob
from app.tasks.scraper_tasks import master_process_file
from app.api.deps import get_current_user_id
from app.core.config import settings

router = APIRouter(prefix="/scrape", tags=["Scraper"])

# Directory to store uploaded files temporarily
UPLOAD_DIR = settings.UPLOAD_DIR
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_ingredients_file(
    file: UploadFile = File(...), 
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id)
):
    # Check file size without reading the whole file into memory
    file.file.seek(0, 2) # Go to end of file
    file_size = file.file.tell() # Get current position (size)
    await file.seek(0) # Go back to beginning

    if file_size > 50 * 1024 * 1024: # 50 MB
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 50MB.")
    
    # Basic Validation
    if not file.filename.lower().endswith(('.xlsx', '.xlsm', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload Excel or CSV.")

    # Save file with a unique name to prevent overwriting
    file_id = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename)[1]
    saved_path = os.path.join(UPLOAD_DIR, f"{file_id}{file_extension}")
    
    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Create Job record in Database
    new_job = ScrapeJob(filename=file.filename, status="pending", user_id=current_user_id)
    session.add(new_job)
    session.commit()
    session.refresh(new_job)

    # Trigger Celery Task
    master_process_file.delay(new_job.id, saved_path)

    return {"job_id": new_job.id, "message": "Scraping task started in background"}

@router.get("/status/{job_id}")
def get_job_status(
    job_id: int, 
    session: Session = Depends(get_session), 
    current_user_id: int = Depends(get_current_user_id) # Token check!
):
    job = session.get(ScrapeJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # SECURITY CHECK: Does this job belong to the person asking?
    if job.user_id != current_user_id:
        raise HTTPException(status_code=403, detail="You do not have permission to view this job")
    
    return {
        "id": job.id,
        "status": job.status,
        "created_at": job.created_at,
        "error_message": job.error_message,
        "result_count": len(job.results) if job.results else 0,
        "data": job.results if job.status == "completed" else None
    }

@router.get("/download/{job_id}")
def download_results(
    job_id: int,
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id) # Token check!
):
    job = session.get(ScrapeJob, job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # SECURITY CHECK: Only the owner can download the file
    if job.user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Unauthorized download attempt")

    if job.status != "completed":
        raise HTTPException(status_code=400, detail="Results are not ready for download")
    
    if not job.results:
        raise HTTPException(status_code=400, detail="No data was found during scraping. Nothing to download.")

    df = pd.DataFrame(job.results)
    
    # Create a temporary file on disk (not RAM)
    fd, path = tempfile.mkstemp(suffix=".xlsx")
    with os.fdopen(fd, 'wb') as f:
        with pd.ExcelWriter(f, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Scrape Results')
            
    safe_filename = job.filename.replace('"', '').replace('\n', '')
    
    # Send the file, and delete it from disk immediately after sending
    return FileResponse(
        path=path, 
        filename=f"results_{safe_filename}",
        background=BackgroundTask(os.remove, path) # Deletes file after download
    )