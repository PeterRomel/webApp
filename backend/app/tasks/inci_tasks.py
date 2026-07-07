# app/tasks/inci_tasks.py
import os
import json
import time
import pandas as pd
from google import genai
from google.genai import types
from app.core.celery_app import celery_app
from app.db.engine import Session, engine
from app.models.scraper import ScrapeJob
from app.core.logger_config import APP_LOGGER
from app.core.config import settings

# --- PROMPT TEMPLATE ---
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


def parse_gemini_response(raw_text, material_batch_list):
    """Helper function to parse the JSON response from Gemini."""
    try:
        cleaned_text = raw_text.strip()
        if cleaned_text.startswith("```json"):
            cleaned_text = cleaned_text[len("```json") :]
        if cleaned_text.endswith("```"):
            cleaned_text = cleaned_text[: -len("```")]

        if not cleaned_text:
            return [
                {
                    "Input Name": mat,
                    "Identified INCI": "Error: Empty text after cleaning",
                }
                for mat in material_batch_list
            ]

        data = json.loads(cleaned_text)

        if "results" in data and isinstance(data["results"], list):
            validated_results = []
            for i, res_item in enumerate(data["results"]):
                input_mat = res_item.get(
                    "input_material",
                    (
                        material_batch_list[i]
                        if i < len(material_batch_list)
                        else "Unknown"
                    ),
                )
                inci_names = res_item.get(
                    "identified_INCI_names", ["Error: Malformed result"]
                )

                # Format to match our frontend table structure perfectly
                validated_results.append(
                    {
                        "Input Name": input_mat,
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
                    "Input Name": mat,
                    "Identified INCI": "Error: Malformed JSON structure",
                }
                for mat in material_batch_list
            ]

    except Exception as e:
        APP_LOGGER.error(f"Failed to parse Gemini JSON: {e}")
        return [
            {"Input Name": mat, "Identified INCI": "Error processing response"}
            for mat in material_batch_list
        ]


@celery_app.task(name="process_inci_job", time_limit=3600)
def process_inci_job(job_id: int, file_path: str):
    APP_LOGGER.info(f"Starting INCI Generator Job {job_id}")

    try:
        col_name = "Ingredient"

        try:
            # Load the file
            if file_path.endswith(".csv"):
                try:
                    input_df = pd.read_csv(
                        file_path, encoding="utf-8", usecols=[col_name]
                    )
                except UnicodeDecodeError:
                    input_df = pd.read_csv(
                        file_path, encoding="cp1252", usecols=[col_name]
                    )
            else:
                input_df = pd.read_excel(file_path, usecols=[col_name])

        except ValueError:
            # Pandas throws a ValueError if the column is entirely missing when using `usecols`
            raise ValueError(
                "The uploaded file is missing the required 'Ingredient' column. Please check your headers."
            )

        # Clean up empty rows
        input_df = input_df.dropna(subset=[col_name])

        # Drop NaNs and convert to string in one go
        input_df[col_name] = input_df[col_name].astype(str).str.strip()

        materials_list = input_df[input_df[col_name] != ""][col_name].tolist()

        if len(materials_list) > 5000:
            raise ValueError("File contains too many materials. Maximum is 5000.")

        # 2. Init Gemini Client
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is missing from server configuration.")

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        api_config = types.GenerateContentConfig(
            temperature=0.0, tools=[types.Tool(google_search=types.GoogleSearch())]
        )

        final_results = []
        batch_size = settings.GEMINI_BATCH_SIZE

        # 3. Process in Batches
        for i in range(0, len(materials_list), batch_size):
            # --- CHECK FOR CANCELLATION ---
            with Session(engine) as session:
                job = session.get(ScrapeJob, job_id)
                if not job or job.status == "cancelled":
                    APP_LOGGER.info(
                        f"Job {job_id} cancelled by user. Stopping Gemini task."
                    )
                    return
            # ------------------------------

            if i > 0:
                time.sleep(4.2)

            batch = materials_list[i : i + batch_size]
            APP_LOGGER.info(f"Job {job_id}: Processing batch {i//batch_size + 1}")

            input_materials_json_str = json.dumps(batch)
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

                raw_text = ""
                if (
                    response.candidates
                    and response.candidates[0].content
                    and response.candidates[0].content.parts
                ):
                    raw_text = "".join(
                        part.text
                        for part in response.candidates[0].content.parts
                        if hasattr(part, "text")
                    )

                batch_parsed_results = parse_gemini_response(raw_text, batch)
                final_results.extend(batch_parsed_results)

            except Exception as api_err:
                APP_LOGGER.error(
                    f"Gemini API Error on batch {i//batch_size + 1}: {api_err}"
                )
                # Append error messages for this batch so the whole job doesn't fail
                final_results.extend(
                    [
                        {"Input Name": mat, "Identified INCI": "API Error"}
                        for mat in batch
                    ]
                )

        # 4. Save Final Results to DB
        with Session(engine) as session:
            job = session.get(ScrapeJob, job_id)
            if job and job.status != "cancelled":
                job.status = "completed"
                job.results = final_results
                job.result_count = len(final_results)
                session.add(job)
                session.commit()
                APP_LOGGER.info(f"Job {job_id} completed successfully.")

    except ValueError as ve:
        _set_job_failed(job_id, str(ve))
    except Exception as e:
        APP_LOGGER.exception(f"Job {job_id} failed: {e}")
        _set_job_failed(job_id, "An unexpected system error occurred.")
    finally:
        # Cleanup file
        if os.path.exists(file_path):
            os.remove(file_path)
