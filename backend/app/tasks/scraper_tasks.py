# app/tasks/scraper_tasks.py
import os
import pandas as pd
from celery import chord
from celery.exceptions import SoftTimeLimitExceeded
from app.core.celery_app import celery_app
from app.db.engine import Session, engine
from app.models.scraper import ScrapeJob
from app.models.user import User
from app.core.scraper_config import process_data
from app.services.scraper_service import CosingScraper
from app.core.logger_config import APP_LOGGER


def _set_job_failed(job_id: int, error_msg: str):
    try:
        with Session(engine) as session:
            job = session.get(ScrapeJob, job_id)
            if job:
                job.status = "failed"
                job.error_message = error_msg
                session.add(job)
                session.commit()
    except Exception as e:
        APP_LOGGER.error(f"Failed to write error DB for job {job_id}: {e}")


@celery_app.task(name="master_process_file")
def master_process_file(job_id: int, file_path: str):
    try:
        col_name = "Ingredient"

        # 1. Read Everything
        if file_path.endswith(".csv"):
            try:
                input_df = pd.read_csv(file_path, encoding="utf-8")
            except UnicodeDecodeError:
                input_df = pd.read_csv(file_path, encoding="cp1252")
        else:
            input_df = pd.read_excel(file_path)

        # 2. Defect 1 Fix: Drop Ghost Data
        input_df = input_df.dropna(how="all", axis=1).dropna(how="all", axis=0)

        if col_name not in input_df.columns:
            raise ValueError(
                "The uploaded file is missing the required 'Ingredient' column."
            )

        input_df = input_df.dropna(subset=[col_name])
        input_df[col_name] = input_df[col_name].astype(str).str.strip()

        # 3. Defect 2 Fix: Collision Protection
        reserved_cols = {
            "Input Name",
            "Match Status",
            "Restriction",
            "Function",
            "Annex No",
            "Annex Ref",
            "Product Type",
            "Max Conc",
            "SCCS Opinion",
            "Row_ID",
        }
        rename_map = {
            c: f"Original_{c}"
            for c in input_df.columns
            if c in reserved_cols and c != col_name
        }
        if rename_map:
            input_df = input_df.rename(columns=rename_map)

        input_df = input_df.fillna("")
        input_df["Row_ID"] = range(1, len(input_df) + 1)

        # 4. Stash Original Data
        original_data = input_df.to_dict(orient="records")
        with Session(engine) as session:
            job = session.get(ScrapeJob, job_id)
            job.original_data = original_data
            session.add(job)
            session.commit()

        # 5. Extract & Fan-Out
        mask = (input_df[col_name].str.len() >= 3) & (
            ~input_df[col_name].str.contains(r"[*?#$]", na=False)
        )
        valid_df = input_df[mask]

        # Convert to list of dicts with Row_ID and Ingredient
        ingredients_list = valid_df[["Row_ID", col_name]].to_dict("records")

        if len(ingredients_list) > 5000:
            raise ValueError("File contains too many ingredients. Max is 5000.")
        if not ingredients_list:
            raise ValueError("No valid ingredients found to scrape.")

        CHUNK_SIZE = 50
        chunks = [
            ingredients_list[i : i + CHUNK_SIZE]
            for i in range(0, len(ingredients_list), CHUNK_SIZE)
        ]

        task_group = [
            process_chunk.s(job_id, chunk, idx + 1, len(chunks))
            for idx, chunk in enumerate(chunks)
        ]

        callback = merge_and_save_results.s(job_id)
        error_callback = handle_chord_error.s(job_id)

        chord(task_group)(callback.set(link_error=error_callback))

    except ValueError as ve:
        _set_job_failed(job_id, str(ve))
    except Exception as e:
        APP_LOGGER.exception(f"Job {job_id} crashed: {e}")
        _set_job_failed(job_id, "A system error occurred while reading your file.")
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


@celery_app.task(name="handle_chord_error")
def handle_chord_error(request, exc, traceback, job_id: int):
    APP_LOGGER.error(f"Chord failed for Job {job_id}. Reason: {exc}")
    _set_job_failed(job_id, "A critical error caused the scraping to fail.")


@celery_app.task(name="process_chunk", time_limit=3600, soft_time_limit=3300)
def process_chunk(job_id: int, ingredients: list, chunk_num: int, total_chunks: int):
    with Session(engine) as session:
        job = session.get(ScrapeJob, job_id)
        if not job or job.status == "cancelled":
            return []

    scraper = None
    chunk_results = []

    try:
        scraper = CosingScraper()

        for index, item in enumerate(ingredients):
            if index > 0 and index % 5 == 0:
                with Session(engine) as session:
                    current_job = session.get(ScrapeJob, job_id)
                    if not current_job or current_job.status == "cancelled":
                        break

            row_id = item["Row_ID"]
            ing_name = item["Ingredient"]

            try:
                rows = process_data(scraper, ing_name)
                # Tag outputs with Row_ID
                for r in rows:
                    r["Row_ID"] = row_id
                chunk_results.extend(rows)
            except Exception as e:
                APP_LOGGER.error(f"Job {job_id}: Failed on {ing_name}: {e}")

        return chunk_results

    except SoftTimeLimitExceeded:
        APP_LOGGER.warning(
            f"Job {job_id} (Chunk {chunk_num}) safely terminated due to timeout."
        )
        return chunk_results
    except Exception as e:
        APP_LOGGER.exception(f"Job {job_id} (Chunk {chunk_num}) failed: {e}")
        return []
    finally:
        if scraper:
            scraper.close()


@celery_app.task(name="merge_and_save_results")
def merge_and_save_results(all_chunk_results, job_id: int):
    final_results = []
    for chunk in all_chunk_results:
        if chunk:
            final_results.extend(chunk)

    try:
        with Session(engine) as session:
            job = session.get(ScrapeJob, job_id)
            if not job:
                return
            if job.status == "cancelled":
                return

            orig_data = job.original_data or []

            # Group scraped results by Row_ID
            results_by_row = {}
            for res in final_results:
                rid = res.pop("Row_ID", None)
                if rid not in results_by_row:
                    results_by_row[rid] = []
                results_by_row[rid].append(res)

            combined_results = []

            # Reconstruct the file sequentially
            for row in orig_data:
                rid = row.pop("Row_ID", None)

                # Create a blank version of the extra columns for multiple matches
                blank_row = {k: "" for k in row.keys()}

                matches = results_by_row.get(rid, [])

                if not matches:
                    # Filtered out or failed
                    empty_match = {
                        "Match Status": "NOT PROCESSED",
                        "Restriction": "-",
                        "Function": "-",
                        "Annex No": "-",
                        "Annex Ref": "-",
                        "Product Type": "-",
                        "Max Conc": "-",
                        "SCCS Opinion": "-",
                    }
                    combined_results.append({**row, **empty_match})
                else:
                    for idx, match in enumerate(matches):
                        if idx == 0:
                            combined_results.append({**row, **match})
                        else:
                            # Second/Third matches get blank original columns
                            combined_results.append({**blank_row, **match})

            job.status = "completed"
            job.results = combined_results
            job.result_count = len(combined_results)
            job.original_data = None  # Free up DB space
            session.add(job)
            session.commit()

    except Exception as e:
        APP_LOGGER.exception(f"Job {job_id} Merge Failed: {e}")
        _set_job_failed(job_id, "Completed, but failed to save formatted results.")
