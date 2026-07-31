# app/api/scraper.py
import pandas as pd
from app.services.google_sheets_service import GoogleSheetsService
import os
import uuid
import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.concurrency import run_in_threadpool
from starlette.background import BackgroundTask
from sqlmodel import Session

from app.db.engine import engine, get_session
from app.models.scraper import ScrapeJob
from app.api.deps import get_current_user_id
from app.core.config import settings
from app.core.logger_config import APP_LOGGER
from app.tasks.scraper_tasks import master_process_file
from app.tasks.inci_tasks import process_inci_job

# Import the new JobService and save helper!
from app.services.scraper_service import JobService, save_upload_to_disk

router = APIRouter(prefix="/scrape", tags=["Scraper"])

UPLOAD_DIR = settings.UPLOAD_DIR
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload")
async def upload_ingredients_file(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id),
):
    # 1. Non-blocking File Check (5MB limit)
    file.file.seek(0, 2)
    if file.file.tell() > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=413, detail="File too large. Maximum size is 5MB."
        )
    await file.seek(0)

    if not file.filename.lower().endswith((".xlsx", ".xlsm", ".xls", ".csv")):
        raise HTTPException(
            status_code=400, detail="Invalid file type. Please upload Excel or CSV."
        )

    service = JobService(session)

    # 2. Database Creation (Sent safely to threadpool)
    new_job = await run_in_threadpool(
        service.create_job, file.filename, current_user_id, "scraper"
    )

    # 3. File Save (Sent safely to threadpool)
    file_id = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename)[1]
    saved_path = os.path.join(UPLOAD_DIR, f"{file_id}{file_extension}")
    await run_in_threadpool(save_upload_to_disk, file.file, saved_path)

    # 4. Trigger Celery
    master_process_file.delay(new_job.id, saved_path)

    return {"job_id": new_job.id, "message": "Scraping task started in background"}


@router.post("/upload/inci")
async def upload_inci_file(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id),
):
    # 1. Non-blocking File Check (5MB limit)
    file.file.seek(0, 2)
    if file.file.tell() > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=413, detail="File too large. Maximum size is 5MB."
        )
    await file.seek(0)

    if not file.filename.lower().endswith((".xlsx", ".xlsm", ".xls", ".csv")):
        raise HTTPException(
            status_code=400, detail="Invalid file type. Please upload Excel or CSV."
        )

    service = JobService(session)

    # 2. Database Creation (Sent safely to threadpool)
    new_job = await run_in_threadpool(
        service.create_job, file.filename, current_user_id, "inci"
    )

    # 3. File Save (Sent safely to threadpool)
    file_id = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename)[1]
    saved_path = os.path.join(UPLOAD_DIR, f"inci_{file_id}{file_extension}")
    await run_in_threadpool(save_upload_to_disk, file.file, saved_path)

    # 4. Trigger Celery
    process_inci_job.delay(new_job.id, saved_path)

    return {"job_id": new_job.id, "message": "INCI task started in background"}


@router.post("/{job_id}/forward-to-scraper")
async def forward_inci_to_scraper(
    job_id: int,
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id),
):
    service = JobService(session)

    # Let the service handle validation, parsing, DB creation, and CSV writing!
    new_job, saved_path = await run_in_threadpool(
        service.process_forwarding, job_id, current_user_id
    )

    master_process_file.delay(new_job.id, saved_path)
    return {"job_id": new_job.id, "message": "Forwarded successfully to Scraper"}


@router.get("/status/{job_id}")
async def get_job_status(
    job_id: int,
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id),
):
    service = JobService(session)

    # Pydantic/SQLModel objects can safely be returned from the threadpool
    job = await run_in_threadpool(service.get_job_safely, job_id, current_user_id)

    return {
        "id": job.id,
        "status": job.status,
        "filename": job.filename,
        "created_at": job.created_at,
        "error_message": job.error_message,
        "result_count": len(job.results) if job.results else 0,
        "data": job.results if job.status == "completed" else None,
    }


@router.get("/download/{job_id}")
async def download_results(
    job_id: int,
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id),
):
    service = JobService(session)

    # Ask the service to generate the excel file and return the path
    path, filename = await run_in_threadpool(
        service.generate_excel, job_id, current_user_id
    )

    safe_filename = filename.replace('"', "").replace("\n", "")

    # Send the file, and automatically delete it from disk immediately after sending
    return FileResponse(
        path=path,
        filename=f"results_{safe_filename}",
        background=BackgroundTask(os.remove, path),
    )


@router.get("/stream/{job_id}")
async def stream_job_status(
    job_id: int,
    current_user_id: int = Depends(get_current_user_id),
):
    async def event_generator():
        try:
            while True:
                # Call the static method directly from the class!
                payload = await run_in_threadpool(
                    JobService.check_status_for_stream, job_id, current_user_id
                )

                yield f"data: {json.dumps(payload)}\n\n"

                if payload["status"] in ["completed", "failed", "cancelled"]:
                    break

                await asyncio.sleep(2)
        except asyncio.CancelledError:
            APP_LOGGER.info(f"SSE connection closed by client for job {job_id}")

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.delete("/{job_id}")
async def delete_job(
    job_id: int,
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id),
):
    service = JobService(session)
    await run_in_threadpool(service.delete_job, job_id, current_user_id)
    return {"detail": "Job deleted successfully"}


@router.post("/{job_id}/cancel")
async def cancel_job(
    job_id: int,
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id),
):
    service = JobService(session)
    await run_in_threadpool(service.cancel_job, job_id, current_user_id)
    return {"detail": "Job successfully cancelled"}


# --- GOOGLE SHEETS PIPELINE ---


@router.post("/{job_id}/edit")
async def push_to_google_sheets(
    job_id: int,
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id),
):
    service = JobService(session)
    job = await run_in_threadpool(service.get_job_safely, job_id, current_user_id)

    if job.status != "completed" or not job.results:
        raise HTTPException(status_code=400, detail="Job has no results to edit.")

    def _sync_create():
        gs = GoogleSheetsService(settings.GOOGLE_OAUTH_TOKEN_FILE)
        return gs.create_edit_sheet(job.results, job.filename)

    sheet_id, sheet_url = await run_in_threadpool(_sync_create)
    return {"sheet_id": sheet_id, "sheet_url": sheet_url, "filename": job.filename}


@router.post("/{job_id}/pull-edit")
async def pull_from_google_sheets(
    job_id: int,
    sheet_id: str,
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id),
):
    service = JobService(session)
    job = await run_in_threadpool(service.get_job_safely, job_id, current_user_id)

    dest_path = os.path.join(UPLOAD_DIR, f"edit_{uuid.uuid4()}.csv")

    def _sync_download():
        gs = GoogleSheetsService(settings.GOOGLE_OAUTH_TOKEN_FILE)
        gs.export_sheet_to_csv(sheet_id, dest_path)

    await run_in_threadpool(_sync_download)

    try:
        if os.path.getsize(dest_path) > 5 * 1024 * 1024:
            raise ValueError("Edited file exceeds 5MB limit.")

        df = pd.read_csv(dest_path, encoding="utf-8")
        df = df.dropna(how="all", axis=1).dropna(how="all", axis=0).fillna("")

        if len(df) > 5000:
            raise ValueError("Edited file exceeds 5,000 rows.")
        if df.empty:
            raise ValueError("Edited file contains no data.")

        if "Ingredient" not in df.columns and "Identified INCI" not in df.columns:
            raise ValueError("Missing 'Ingredient' or 'Identified INCI' column.")

        results_json = df.to_dict(orient="records")
        new_job = await run_in_threadpool(
            service.create_job, f"[Edited] {job.filename}", current_user_id, "root"
        )

        with Session(engine) as db:
            active_job = db.get(ScrapeJob, new_job.id)
            active_job.status = "completed"
            active_job.results = results_json
            active_job.result_count = len(results_json)
            db.add(active_job)
            db.commit()

        # UNCOMMENTED AND UPDATED
        def _sync_delete():
            gs = GoogleSheetsService(settings.GOOGLE_OAUTH_TOKEN_FILE)
            gs.delete_sheet(sheet_id)

        await run_in_threadpool(_sync_delete)

        return {"job_id": new_job.id, "message": "Edits pulled and saved successfully."}

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        APP_LOGGER.error(f"Pull Edit Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to process edited data.")
    finally:
        if os.path.exists(dest_path):
            os.remove(dest_path)


@router.post("/{job_id}/cancel-edit")
async def cancel_edit_session(
    job_id: int,
    sheet_id: str,
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id),
):
    service = JobService(session)
    await run_in_threadpool(service.get_job_safely, job_id, current_user_id)

    def _sync_delete():
        gs = GoogleSheetsService(settings.GOOGLE_OAUTH_TOKEN_FILE)
        gs.delete_sheet(sheet_id)

    await run_in_threadpool(_sync_delete)
    return {"message": "Edit session cancelled and sheet deleted."}


@router.post("/{job_id}/root-forward-to-scraper")
async def root_forward_to_scraper(
    job_id: int,
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id),
):
    service = JobService(session)
    job = await run_in_threadpool(service.get_job_safely, job_id, current_user_id)

    if job.job_type != "root":
        raise HTTPException(
            status_code=400,
            detail="Only Root jobs can be explicitly forwarded this way.",
        )

    df = pd.DataFrame(job.results)

    if "Ingredient" in df.columns and "Identified INCI" in df.columns:
        df = df.rename(columns={"Ingredient": "Original_Ingredient"})
        df = df.rename(columns={"Identified INCI": "Ingredient"})
    elif "Identified INCI" in df.columns and "Ingredient" not in df.columns:
        df = df.rename(columns={"Identified INCI": "Ingredient"})
    elif "Ingredient" not in df.columns:
        raise HTTPException(
            status_code=400, detail="Missing 'Ingredient' column required for Scraper."
        )

    file_id = str(uuid.uuid4())
    saved_path = os.path.join(UPLOAD_DIR, f"forwarded_{file_id}.csv")
    df.to_csv(saved_path, index=False)

    new_job = await run_in_threadpool(
        service.create_job,
        job.filename.replace("[Edited]", "[Scraping]"),
        current_user_id,
        "scraper",
    )
    master_process_file.delay(new_job.id, saved_path)

    return {"job_id": new_job.id, "message": "Root job forwarded to Scraper."}


@router.post("/{job_id}/root-forward-to-inci")
async def root_forward_to_inci(
    job_id: int,
    session: Session = Depends(get_session),
    current_user_id: int = Depends(get_current_user_id),
):
    service = JobService(session)
    job = await run_in_threadpool(service.get_job_safely, job_id, current_user_id)

    if job.job_type != "root":
        raise HTTPException(
            status_code=400,
            detail="Only Root jobs can be explicitly forwarded this way.",
        )

    df = pd.DataFrame(job.results)

    if "Ingredient" not in df.columns:
        raise HTTPException(
            status_code=400,
            detail="Missing 'Ingredient' column required for INCI generation.",
        )

    file_id = str(uuid.uuid4())
    saved_path = os.path.join(UPLOAD_DIR, f"forwarded_inci_{file_id}.csv")
    df.to_csv(saved_path, index=False)

    new_job = await run_in_threadpool(
        service.create_job,
        job.filename.replace("[Edited]", "[INCI]"),
        current_user_id,
        "inci",
    )
    process_inci_job.delay(new_job.id, saved_path)

    return {"job_id": new_job.id, "message": "Root job forwarded to INCI generator."}
