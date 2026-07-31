# app/tasks/inci_tasks.py
import os
import time
import json
import pandas as pd
from google import genai
from google.genai import types
from app.core.celery_app import celery_app
from app.db.engine import Session, engine
from app.models.scraper import ScrapeJob
from app.models.user import User
from app.core.logger_config import APP_LOGGER
from app.core.config import settings

prompt_template_batch_basic_inci = """Your *only* output must be a single, valid JSON object string. Do not include any explanatory text, markdown formatting, or anything else before or after the JSON.

Task: For each cosmetic material/mixture name provided in the input list, identify its INCI (International Nomenclature of Cosmetic Ingredients) name(s).

Input: A JSON array of material strings. Example:
["material1", "SUNCAT MTA", "Water, Glycol", "A mispelled ingredeint"]

Instructions for each input_material string:
1. Analyze the input_material string.
2. First, attempt to identify if the entire input_material string matches a known INCI name for a single material.
3. If not, then check if the input_material string is a known trade name or common name for a specific *mixture* of cosmetic ingredients. If it is, identify the INCI name for *each component* of that mixture.
4. If not, then consider if the input_material string might represent a list of multiple individual ingredients separated by common delimiters (spaces, hyphens, parentheses, commas - e.g., "Water, Glycol"). If so, identify the INCI name for *each component*.
5. For any INCI name identified through steps 2-4, be robust to minor misspellings. If you find a likely correction, use the corrected INCI name.
6. The result for each input_material will be a list of one or more 'identified_INCI_names'. If no identification is possible, this list should contain only the string "INCI Name Not Found".

Output Formatting:
Format your output *strictly and only* as a JSON object. This object should have a single key "results".
The value of "results" must be a JSON array. Each element in this array should be an object corresponding to an input_material from the original batch, containing:
    a. "input_material": The original input_material string.
    b. "identified_INCI_names": A list of INCI name strings identified according to the instructions above.
"""


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
        APP_LOGGER.error(f"Failed to write error state to DB for job {job_id}: {e}")


def parse_gemini_response(raw_text, material_batch_list):
    try:
        cleaned_text = raw_text.strip()
        if cleaned_text.startswith("```json"):
            cleaned_text = cleaned_text[len("```json") :]
        if cleaned_text.endswith("```"):
            cleaned_text = cleaned_text[: -len("```")]

        if not cleaned_text:
            return [
                {
                    "Identified INCI": "Error: Empty text after cleaning",
                }
                for mat in material_batch_list
            ]

        data = json.loads(cleaned_text)

        if "results" in data and isinstance(data["results"], list):
            validated_results = []
            for i, res_item in enumerate(data["results"]):
                inci_names = res_item.get(
                    "identified_INCI_names", ["Error: Malformed result"]
                )

                validated_results.append(
                    {
                        "Identified INCI": (
                            ", ".join(inci_names)
                            if isinstance(inci_names, list)
                            else str(inci_names)
                        ),
                    }
                )
            return validated_results
        else:
            return [
                {
                    "Identified INCI": "Error: Malformed JSON structure",
                }
                for mat in material_batch_list
            ]
    except Exception as e:
        APP_LOGGER.error(f"Failed to parse Gemini JSON: {e}")
        return [
            {"Identified INCI": "Error processing response"}
            for mat in material_batch_list
        ]


@celery_app.task(name="process_inci_job", time_limit=3600)
def process_inci_job(job_id: int, file_path: str):
    APP_LOGGER.info(f"Starting INCI Generator Job {job_id}")

    try:
        col_name = "Ingredient"

        # 1. Read the Entire File
        if file_path.endswith(".csv"):
            try:
                input_df = pd.read_csv(file_path, encoding="utf-8")
            except UnicodeDecodeError:
                input_df = pd.read_csv(file_path, encoding="cp1252")
        else:
            input_df = pd.read_excel(file_path)

        # 2. DropNA for ghost columns/rows
        input_df = input_df.dropna(how="all", axis=1).dropna(how="all", axis=0)

        if col_name not in input_df.columns:
            raise ValueError(
                "The uploaded file is missing the required 'Ingredient' column."
            )

        input_df = input_df.dropna(subset=[col_name])
        input_df[col_name] = input_df[col_name].astype(str).str.strip()

        # 3. Prevent column name collisions
        reserved_cols = {"Identified INCI", "Row_ID"}
        rename_map = {
            c: f"Original_{c}"
            for c in input_df.columns
            if c in reserved_cols and c != col_name
        }
        if rename_map:
            input_df = input_df.rename(columns=rename_map)

        input_df = input_df.fillna("")  # Safe JSON conversion
        input_df["Row_ID"] = range(1, len(input_df) + 1)  # Tag with IDs

        if len(input_df) > 5000:
            raise ValueError("File contains too many materials. Maximum is 5000.")
        if input_df.empty:
            raise ValueError("File contains no valid ingredients to process.")

        # 4. Stash Original Data to DB
        original_data = input_df.to_dict(orient="records")
        with Session(engine) as session:
            job = session.get(ScrapeJob, job_id)
            job.original_data = original_data
            session.add(job)
            session.commit()

        # Extract Lightweight List for processing
        materials_list = input_df[["Row_ID", col_name]].to_dict("records")

        # Init Gemini
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is missing from server configuration.")

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        api_config = types.GenerateContentConfig(
            temperature=0.0, tools=[types.Tool(google_search=types.GoogleSearch())]
        )

        final_results = []
        batch_size = settings.GEMINI_BATCH_SIZE

        # Process in Batches
        for i in range(0, len(materials_list), batch_size):
            with Session(engine) as session:
                job = session.get(ScrapeJob, job_id)
                if not job or job.status == "cancelled":
                    APP_LOGGER.info(f"Job {job_id} cancelled by user. Stopping task.")
                    return

            if i > 0:
                time.sleep(4.2)  # Rate limit protection

            batch_dicts = materials_list[i : i + batch_size]
            batch_strings = [item[col_name] for item in batch_dicts]
            APP_LOGGER.info(f"Job {job_id}: Processing batch {i//batch_size + 1}")

            input_materials_json_str = json.dumps(batch_strings)
            final_prompt = (
                prompt_template_batch_basic_inci
                + "\n\nProcess the following:\n"
                + input_materials_json_str
            )

            try:
                response = client.models.generate_content(
                    model=settings.GEMINI_MODEL_NAME,
                    contents=[final_prompt],
                    config=api_config,
                )
                raw_text = (
                    "".join(
                        part.text
                        for part in response.candidates[0].content.parts
                        if hasattr(part, "text")
                    )
                    if response.candidates
                    else ""
                )

                batch_parsed_results = parse_gemini_response(raw_text, batch_strings)

                # Re-attach Row_ID to the generated results
                for idx, parsed_item in enumerate(batch_parsed_results):
                    parsed_item["Row_ID"] = batch_dicts[idx]["Row_ID"]
                final_results.extend(batch_parsed_results)

            except Exception as api_err:
                APP_LOGGER.error(
                    f"Gemini API Error on batch {i//batch_size + 1}: {api_err}"
                )
                for item in batch_dicts:
                    final_results.append(
                        {
                            "Row_ID": item["Row_ID"],
                            "Identified INCI": "API Error",
                        }
                    )

        # 5. Merge Stashed Data with Results
        results_by_row = {res.pop("Row_ID"): res for res in final_results}
        combined_results = []

        for row in original_data:
            rid = row.pop("Row_ID", None)
            match = results_by_row.get(rid, {"Identified INCI": "Error"})
            combined_results.append({**row, **match})

        with Session(engine) as session:
            job = session.get(ScrapeJob, job_id)
            if job and job.status != "cancelled":
                job.status = "completed"
                job.results = combined_results
                job.result_count = len(combined_results)
                job.original_data = None  # Cleanup stash
                session.add(job)
                session.commit()
                APP_LOGGER.info(f"Job {job_id} completed successfully.")

    except ValueError as ve:
        _set_job_failed(job_id, str(ve))
    except Exception as e:
        APP_LOGGER.exception(f"Job {job_id} failed: {e}")
        _set_job_failed(job_id, "An unexpected system error occurred.")
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)
