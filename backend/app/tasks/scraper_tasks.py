# app/tasks/scraper_tasks.py
import os
import pandas as pd
from celery import chord
from app.core.celery_app import celery_app
from app.db.engine import Session, engine
from app.models.scraper import ScrapeJob
from app.core.scraper_config import process_data
from app.services.scraper_service import CosingScraper
from app.core.logger_config import APP_LOGGER

def _set_job_failed(job_id: int, error_msg: str):
    """Helper to update DB when a job fails"""
    try:
        with Session(engine) as session:
            job = session.get(ScrapeJob, job_id)
            if job:
                job.status = "failed"
                job.error_message = error_msg
                session.add(job)
                session.commit()
    except Exception as e:
        APP_LOGGER.error(f"Failed to write error state to DB for job {job_id}: {e}")

# ---------------------------------------------------------
# 1. THE SPLITTER (Master Task)
# ---------------------------------------------------------
@celery_app.task(name="master_process_file")
def master_process_file(job_id: int, file_path: str):
    try:
        # Load the file
        if file_path.endswith('.csv'):
            input_df = pd.read_csv(file_path)
        else:
            input_df = pd.read_excel(file_path)
        
        # Catch predictable user errors!
        if 'Ingredient' not in input_df.columns:
            raise ValueError("The uploaded file is missing the required 'Ingredient' column. Please check your headers.")

        # Clean up empty rows
        input_df = input_df.dropna(subset=['Ingredient'])
        
        # Drop NaNs and convert to string in one go
        input_df['Ingredient'] = input_df['Ingredient'].astype(str).str.strip()

        # Combined Boolean Mask (Faster than multiple re-assignments)
        # We create one "True/False" list and apply it once.
        mask = (input_df['Ingredient'].str.len() >= 3) & (~input_df['Ingredient'].str.contains(r'[*?#$]', na=False))

        # Filter and Convert the column to a simple Python list
        ingredients_list = input_df.loc[mask, 'Ingredient'].tolist()

        # Define Chunk Size (e.g., 50 ingredients per task)
        CHUNK_SIZE = 50
        
        # Split the list into chunks
        chunks = [
            ingredients_list[i:i + CHUNK_SIZE] 
            for i in range(0, len(ingredients_list), CHUNK_SIZE)
        ]
        
        APP_LOGGER.info(f"Job {job_id}: Split {len(ingredients_list)} ingredients into {len(chunks)} tasks.")

        # Create the concurrent tasks
        task_group = [process_chunk.s(job_id, chunk, idx+1, len(chunks)) for idx, chunk in enumerate(chunks)]
        
        # Create the callback task (Runs ONLY when all chunks are done)
        callback = merge_and_save_results.s(job_id)
        
        # Execute the Chord (Task Group -> Callback)
        chord(task_group)(callback)

    # Catch the ValueError we just raised (Friendly Error)
    except ValueError as ve:
            APP_LOGGER.warning(f"Job {job_id} failed validation: {ve}")
            _set_job_failed(job_id, str(ve))

    # Catch all other unexpected Python errors (System Error)
    except Exception as e:
        APP_LOGGER.exception(f"Job {job_id} crashed unexpectedly: {e}")
        _set_job_failed(job_id, "A system error occurred while reading your file. Support has been notified.")
    
    finally:
        # We don't need the file anymore because data is safely in Celery/Redis memory
        if os.path.exists(file_path):
            os.remove(file_path)

# ---------------------------------------------------------
# 2. THE WORKER (Concurrent Sub-Task)
# ---------------------------------------------------------
@celery_app.task(name="process_chunk", time_limit=3600)
def process_chunk(job_id: int, ingredients: list, chunk_num: int, total_chunks: int):
    scraper = None
    chunk_results = []
    
    APP_LOGGER.info(f"Job {job_id}: Starting chunk {chunk_num}/{total_chunks}")
    
    try:
        scraper = CosingScraper()
        
        for index, ing_name in enumerate(ingredients):
            try:
                rows = process_data(scraper, ing_name)
                chunk_results.extend(rows)
            except Exception as e:
                APP_LOGGER.error(f"Job {job_id} (Chunk {chunk_num}): Failed on {ing_name}: {e}")
                
        return chunk_results # Returns data to the callback task
        
    except Exception as e:
        APP_LOGGER.exception(f"Job {job_id} (Chunk {chunk_num}) failed entirely: {e}")
        return [] # Return empty list so the merge doesn't break
        
    finally:
        if scraper:
            scraper.close()

# ---------------------------------------------------------
# 3. THE MERGER (Callback Task)
# ---------------------------------------------------------
@celery_app.task(name="merge_and_save_results")
def merge_and_save_results(all_chunk_results, job_id: int):
    # 'all_chunk_results' is a list of lists returned by the sub-tasks.
    # We need to flatten it into one big list.
    final_results = []
    for chunk in all_chunk_results:
        if chunk:  # Ensure it's not None
            final_results.extend(chunk)
            
    try:
        with Session(engine) as session:
            job = session.get(ScrapeJob, job_id)
            job.status = "completed"
            job.results = final_results
            job.result_count = len(final_results)
            session.add(job)
            session.commit()
            
        APP_LOGGER.info(f"Job {job_id}: Successfully merged and saved {len(final_results)} results.")
        
    except Exception as e:
        APP_LOGGER.exception(f"Job {job_id}: Failed to save merged results: {e}")
        _set_job_failed(job_id, "Scraping completed, but failed to save results to the database.")