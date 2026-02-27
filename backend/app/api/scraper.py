# app/api/scraper.py
import os
import io
import uuid
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlmodel import Session
from app.db.engine import get_session
from app.models.scraper import ScrapeJob
from app.tasks.scraper_tasks import process_cosing_file
from app.api.deps import get_current_user_id

router = APIRouter(prefix="/scrape", tags=["Scraper"])

# Directory to store uploaded files temporarily
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_ingredients_file(
    file: UploadFile = File(...), 
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id) # Token check!
):
    # 1. Basic Validation
    if not file.filename.endswith(('.xlsx', '.csv')):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload Excel or CSV.")

    # 2. Save file with a unique name to prevent overwriting
    file_id = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename)[1]
    saved_path = os.path.join(UPLOAD_DIR, f"{file_id}{file_extension}")
    
    with open(saved_path, "wb") as buffer:
        buffer.write(await file.read())

    # 3. Create Job record in Database
    new_job = ScrapeJob(filename=file.filename, status="pending", user_id=current_user_id)
    session.add(new_job)
    session.commit()
    session.refresh(new_job)

    # 4. Trigger Celery Task
    process_cosing_file.delay(new_job.id, saved_path)

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
    
    # 1. Convert the JSON results in the DB back to a DataFrame
    df = pd.DataFrame(job.results)

    # 2. Save to a "Bytes" buffer (this stays in RAM, not on your disk!)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Scrape Results')
    output.seek(0)

    # 3. Stream the file to the user
    headers = {
        'Content-Disposition': f'attachment; filename="results_{job.filename}"'
    }
    return StreamingResponse(output, headers=headers, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')