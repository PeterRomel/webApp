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

@celery_app.task(name="process_cosing_file")
def process_cosing_file(job_id: int, file_path: str):
    with Session(engine) as session:
        job = session.get(ScrapeJob, job_id)
        job.status = "processing"
        session.add(job)
        session.commit()

        try:
            try:
                # Load Inputs
                input_df = pd.read_excel(file_path)
                if 'Ingredient' not in input_df.columns:
                    raise ValueError("Excel file must have 'Ingredient' column")
            except Exception as e:
                APP_LOGGER(f"File Error: {e}")
                return

            # Initialize Scraper
            scraper = CosingScraper()
            all_results = []
            
            try:
                total = len(input_df)
                for index, row in input_df.iterrows():
                    ing_name = str(row['Ingredient']).strip()
                    APP_LOGGER.error(f"Processing ({index+1}/{total}): {ing_name}")
                    
                    rows = process_data(scraper, ing_name)
                    all_results.extend(rows)
                    
            except KeyboardInterrupt:
                APP_LOGGER.info("Stopping...")
            finally:
                scraper.close()

            job.status = "completed"
            job.results = all_results
        except Exception as e:
            job.status = "failed"
        finally:
            # DELETE the uploaded file after processing to save space
            if os.path.exists(file_path):
                os.remove(file_path)
        
        session.add(job)
        session.commit()