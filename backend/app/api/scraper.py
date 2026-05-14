# app/api/scraper.py
import os
import io
import uuid
import shutil
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
import tempfile
import asyncio
import json
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.concurrency import run_in_threadpool
from starlette.background import BackgroundTask
from sqlmodel import Session
from app.db.engine import get_session, engine
from app.models.scraper import ScrapeJob
from app.tasks.scraper_tasks import master_process_file
from app.api.deps import get_current_user_id
from app.core.config import settings

router = APIRouter(prefix="/scrape", tags=["Scraper"])

# Directory to store uploaded files temporarily
UPLOAD_DIR = settings.UPLOAD_DIR
os.makedirs(UPLOAD_DIR, exist_ok=True)

def save_upload_to_disk(upload_file_obj, destination_path):
    with open(destination_path, "wb") as buffer:
        shutil.copyfileobj(upload_file_obj, buffer)


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

    if file_size > 5 * 1024 * 1024: # 50 MB
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 50MB.")
    
    # Basic Validation
    if not file.filename.lower().endswith(('.xlsx', '.xlsm', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload Excel or CSV.")

    # Save file with a unique name to prevent overwriting
    file_id = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename)[1]
    saved_path = os.path.join(UPLOAD_DIR, f"{file_id}{file_extension}")
    
    # Send the blocking save operation to a background thread
    await run_in_threadpool(save_upload_to_disk, file.file, saved_path)

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
        "filename": job.filename,
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

@router.get("/stream/{job_id}")
async def stream_job_status(
    job_id: int, 
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id) # Uses your normal, secure auth!
):
    # 1. Create a helper function outside the generator
    def _check_job_status(job_id_to_check: int):
        with Session(engine) as db:
            current_job = db.get(ScrapeJob, job_id_to_check)
            if not current_job:
                return {"status": "failed", "error_message": "Job was deleted or no longer exists."}
            return {
                "status": current_job.status,
                "error_message": current_job.error_message
            }

    # 2. Update the generator
    async def event_generator():
        from app.core.logger_config import APP_LOGGER
        try:
            while True:
                # Run the sync DB check in a background thread
                payload = await run_in_threadpool(_check_job_status, job_id)
                
                # Send data to frontend
                yield f"data: {json.dumps(payload)}\n\n"

                # Check if we should close the connection
                if payload["status"] in ["completed", "failed"]:
                    break
                
                # Pause safely
                await asyncio.sleep(2)
                
        except asyncio.CancelledError:
            APP_LOGGER.info(f"SSE connection closed by client for job {job_id}")
    
    # 3. Return the StreamingResponse
    # media_type="text/event-stream" tells the browser to keep the connection open!
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.delete("/{job_id}")
def delete_job(
    job_id: int,
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id) # Require auth token
):
    job = session.get(ScrapeJob, job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # BEST PRACTICE: SECURITY CHECK
    # Ensure the user requesting the delete actually owns the job
    if job.user_id != current_user_id:
        raise HTTPException(status_code=403, detail="You do not have permission to delete this job")

    # Delete the job from the database
    session.delete(job)
    session.commit()
    
    return {"detail": "Job deleted successfully"}
