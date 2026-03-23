# app/tasks/scraper_tasks.py
from app.core.celery_app import celery_app
from app.db.engine import Session, engine
from app.models.scraper import ScrapeJob
from app.models.user import User
#from sqlmodel import select
from app.core.scraper_config import process_data
from app.services.scraper_service import CosingScraper
from app.core.logger_config import APP_LOGGER
import pandas as pd
import os

@celery_app.task(name="process_cosing_file", time_limit=3600, soft_time_limit=3500)
def process_cosing_file(job_id: int, file_path: str):
    try:    
        with Session(engine) as session:
            job = session.get(ScrapeJob, job_id)
            job.status = "processing"
            session.add(job)
            session.commit()
    
        scraper = None

        # Load Inputs
        if file_path.endswith('.csv'):
            input_df = pd.read_csv(file_path)
        else:
            input_df = pd.read_excel(file_path)
        
        if 'Ingredient' not in input_df.columns:
            raise ValueError("The file must have 'Ingredient' column")

        # Initialize Scraper
        scraper = CosingScraper()
        all_results = []
        

        
        total = len(input_df)
        for index, row in input_df.iterrows():
            try:
                ing_name = str(row['Ingredient']).strip()
                APP_LOGGER.info(f"Processing job {job_id}: ({index+1}/{total}): {ing_name}")
                rows = process_data(scraper, ing_name)
                all_results.extend(rows)
            except Exception as e:
                APP_LOGGER.exception(f"Failed to process job {job_id}: ({index+1}/{total}): {ing_name}\n" + e)

        with Session(engine) as session:
            job = session.get(ScrapeJob, job_id)
            job.status = "completed"
            job.results = all_results
            session.add(job)
            session.commit()

    except Exception as e:
        APP_LOGGER.exception(f"Scraper Error: {e}")
        with Session(engine) as session:
            job = session.get(ScrapeJob, job_id)
            job.status = "failed"
            session.add(job)
            session.commit()
        
    finally:
        if scraper:
            scraper.close()
        # DELETE the uploaded file after processing to save space
        if os.path.exists(file_path):
            os.remove(file_path)
    