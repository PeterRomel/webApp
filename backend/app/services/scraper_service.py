# app/services/scraper_service.py
import os
import time
import json
import uuid
import shutil
import tempfile
import pandas as pd
from fastapi import HTTPException, status
from sqlmodel import Session, select, func

from app.db.engine import engine
from app.models.scraper import ScrapeJob
from app.core.scraper_config import split_patterns
from app.core.logger_config import APP_LOGGER
from app.core.config import settings

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager


# --- 1. HELPER FUNCTIONS ---
def save_upload_to_disk(upload_file_obj, destination_path):
    """Safely streams an uploaded file to the hard drive."""
    with open(destination_path, "wb") as buffer:
        shutil.copyfileobj(upload_file_obj, buffer)


# --- 2. JOB SERVICE (Database & Business Logic) ---
class JobService:
    """Handles all Database interactions and heavy lifting for Scraper Jobs."""

    def __init__(self, session: Session):
        self.session = session

    def enforce_job_limit(self, user_id: int, limit: int = 2):
        """Ensures a user doesn't exceed concurrent running jobs."""
        active_jobs_query = select(func.count(ScrapeJob.id)).where(
            ScrapeJob.user_id == user_id, ScrapeJob.status == "pending"
        )
        active_jobs_count = self.session.exec(active_jobs_query).one()

        if active_jobs_count >= limit:
            raise HTTPException(
                status_code=429,
                detail=f"You already have {limit} jobs running. Please wait for them to finish or cancel them.",
            )

    def create_job(self, filename: str, user_id: int, job_type: str) -> ScrapeJob:
        """Checks limits and creates a new job in the database."""
        self.enforce_job_limit(user_id)

        new_job = ScrapeJob(
            filename=filename, status="pending", user_id=user_id, job_type=job_type
        )
        self.session.add(new_job)
        self.session.commit()
        self.session.refresh(new_job)
        return new_job

    def get_job_safely(self, job_id: int, user_id: int) -> ScrapeJob:
        """Fetches a job and ensures the user owns it."""
        job = self.session.get(ScrapeJob, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.user_id != user_id:
            raise HTTPException(status_code=403, detail="Permission denied")
        return job

    def delete_job(self, job_id: int, user_id: int):
        """Deletes a job from the database."""
        job = self.get_job_safely(job_id, user_id)
        if job.status == "pending":
            raise HTTPException(
                status_code=400,
                detail="Cannot delete a job that is currently running.",
            )
        self.session.delete(job)
        self.session.commit()

    def cancel_job(self, job_id: int, user_id: int):
        """Marks a pending job as cancelled."""
        job = self.get_job_safely(job_id, user_id)
        if job.status != "pending":
            raise HTTPException(
                status_code=400, detail="Only active jobs can be cancelled."
            )

        job.status = "cancelled"
        job.error_message = "Job was cancelled by the user."
        self.session.add(job)
        self.session.commit()

    def generate_excel(self, job_id: int, user_id: int) -> tuple[str, str]:
        """Converts Job results JSON into an Excel file on disk."""
        job = self.get_job_safely(job_id, user_id)

        if job.status != "completed":
            raise HTTPException(
                status_code=400, detail="Results are not ready for download."
            )
        if not job.results:
            raise HTTPException(
                status_code=400, detail="No data was found during scraping."
            )

        df = pd.DataFrame(job.results)

        # Create a temporary file on disk
        fd, path = tempfile.mkstemp(suffix=".xlsx")
        with os.fdopen(fd, "wb") as f:
            with pd.ExcelWriter(f, engine="openpyxl") as writer:
                df.to_excel(writer, index=False, sheet_name="Scrape Results")

        return path, job.filename

    def process_forwarding(
        self, original_job_id: int, user_id: int
    ) -> tuple[ScrapeJob, str]:
        """Takes an INCI job, parses the results, and prepares a new Scraper job."""
        original_job = self.get_job_safely(original_job_id, user_id)

        if original_job.status != "completed" or not original_job.results:
            raise HTTPException(
                status_code=400, detail="Cannot forward an incomplete job."
            )
        if original_job.job_type != "inci":
            raise HTTPException(
                status_code=400, detail="Only INCI jobs can be forwarded."
            )

        # Re-check active limits before creating a new job
        self.enforce_job_limit(user_id)

        # Extract Cleaned INCI names
        cleaned_ingredients = []
        for item in original_job.results:
            inci_text = item.get("Identified INCI", "")
            if not inci_text:
                continue
            text_lower = inci_text.lower()
            if "error" in text_lower or "not found" in text_lower:
                continue

            parts = [p.strip() for p in inci_text.split(",")]
            cleaned_ingredients.extend(parts)

        if not cleaned_ingredients:
            raise HTTPException(
                status_code=400, detail="No valid INCI names found to forward."
            )

        # Construct CSV
        df = pd.DataFrame({"Ingredient": cleaned_ingredients})
        file_id = str(uuid.uuid4())
        saved_path = os.path.join(settings.UPLOAD_DIR, f"forwarded_{file_id}.csv")
        df.to_csv(saved_path, index=False)

        # Create New Scraper Job
        new_job = ScrapeJob(
            filename=f"[Forwarded] {original_job.filename}",
            status="pending",
            user_id=user_id,
            job_type="scraper",
        )
        self.session.add(new_job)
        self.session.commit()
        self.session.refresh(new_job)

        return new_job, saved_path

    @staticmethod
    def check_status_for_stream(job_id: int, user_id: int) -> dict:
        """
        Lightweight, isolated database check for the SSE Event Stream.
        We use a @staticmethod and a local 'with Session' to prevent
        database connection exhaustion during long-running streams.
        """
        with Session(engine) as db:
            job = db.get(ScrapeJob, job_id)
            if not job:
                return {"status": "failed", "error_message": "Job deleted or missing."}

            # Security check: Ensure the person listening actually owns the job
            if job.user_id != user_id:
                return {"status": "failed", "error_message": "Unauthorized access."}

            return {"status": job.status, "error_message": job.error_message}


# --- 3. SCRAPER SERVICE (Selenium Logic) ---
class CosingScraper:
    def __init__(self):
        self.driver = None
        self.annex_cache = {}  # Cache to store downloaded Annexes

        try:
            self.driver = self._setup_driver()
            APP_LOGGER.info("Initializing Browser Session...")
            self.driver.get(settings.SEARCH_START_URL)
            time.sleep(3)
        except Exception as e:
            APP_LOGGER.exception(f"Failed to load start URL: {e}")
            if self.driver:
                self.driver.quit()
            raise e

    def _setup_driver(self):
        """Configures Chrome with Performance logging for CDP."""
        chrome_options = Options()
        chrome_options.set_capability("goog:loggingPrefs", {"performance": "ALL"})

        # Headless Flags
        chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")

        # Anti-detection
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")

        service = Service(executable_path=settings.CHROME_DRIVER_PATH)
        chrome_options.binary_location = settings.CHROME_BROWSER_PATH
        driver = webdriver.Chrome(service=service, options=chrome_options)

        # Add these two lines to prevent infinite hanging:
        driver.set_page_load_timeout(60)  # Stop waiting for page load after 60s
        driver.set_script_timeout(60)  # Kill async JS injections after 60s

        return driver

    def search_ingredient(self, ingredient_name):
        """
        Uses JS Injection to fetch search results directly from the browser context.
        """
        all_results = []
        page_number = 1

        # JS Script Template
        js_script = """
        var callback = arguments[arguments.length - 1];
        var formData = new FormData();
        formData.append("query", "");

        var apiUrl = arguments[0];
        var params = new URLSearchParams({
            "apiKey": arguments[1],
            "text": arguments[2],
            "pageSize": arguments[3],
            "pageNumber": arguments[4]
        });

        fetch(apiUrl + "?" + params.toString(), {
            method: "POST",
            body: formData
        })
        .then(response => response.json())
        .then(data => callback(data))
        .catch(error => callback({"error": error.toString()}));
        """

        while True:
            try:
                # Execute Async Script
                response_data = self.driver.execute_async_script(
                    js_script,
                    settings.API_BASE_URL,
                    settings.API_KEY_COSING,
                    ingredient_name,
                    settings.PAGE_SIZE,
                    page_number,
                )

                if "error" in response_data:
                    APP_LOGGER.error(
                        f"JS Error searching {ingredient_name}: {response_data['error']}"
                    )
                    break

                results = response_data.get("results", [])
                if not results:
                    break

                all_results.extend(results)

                # Pagination Check
                if len(results) < settings.PAGE_SIZE:
                    break

                page_number += 1
                time.sleep(0.2)  # Small delay to be polite

            except Exception as e:
                APP_LOGGER.exception(f"Selenium Error on {ingredient_name}: {e}")
                break

        return all_results

    def get_annex_data(self, annex_roman):
        """
        Uses CDP (Chrome DevTools Protocol) to intercept the official network request,
        capture the complex headers/body, and replay it to fetch the full Annex.
        """
        # 1. Return cached data if available
        if annex_roman in self.annex_cache:
            return self.annex_cache[annex_roman]

        APP_LOGGER.info(f"--- Fetching Full Annex {annex_roman} (Smart Intercept) ---")

        start_url = settings.ANNEX_START_URL + annex_roman
        captured_body_checker = f'"annexNo":"{annex_roman}"'
        all_results = []

        try:
            # A. Enable Network Tracking
            self.driver.execute_cdp_cmd("Network.enable", {})

            # B. Load Page & Wait for Auto-Search
            self.driver.get(start_url)

            # C. Intercept Request via Logs (Dynamic Polling up to 15s)
            captured_body = None
            captured_headers = None

            for _ in range(15):  # Try for 15 seconds
                logs = self.driver.get_log("performance")
                for entry in logs:
                    try:
                        message = json.loads(entry["message"])["message"]
                        if message["method"] == "Network.requestWillBeSent":
                            params = message["params"]
                            request = params["request"]
                            if (
                                "search-api/prod/rest/search" in request["url"]
                                and request["method"] == "POST"
                            ):
                                if (
                                    "postData" in request
                                    and captured_body_checker in request["postData"]
                                ):
                                    captured_body = request["postData"]
                                else:
                                    try:
                                        data = self.driver.execute_cdp_cmd(
                                            "Network.getRequestPostData",
                                            {"requestId": params["requestId"]},
                                        )
                                        captured_body = data["postData"]
                                        if not captured_body_checker in captured_body:
                                            captured_body = None
                                            continue
                                    except:
                                        continue
                                captured_headers = request["headers"]
                                break
                    except:
                        continue

                # If we caught the network data, break out of the 15-second waiting loop!
                if captured_body:
                    break
                time.sleep(1)  # Wait 1 second before checking logs again

            if not captured_body:
                APP_LOGGER.error(
                    f"Could not intercept network signature for Annex {annex_roman} after 15 seconds."
                )
                return {}

            # D. Replay Loop using Captured Signature
            page_number = 1
            content_type = captured_headers.get("Content-Type") or captured_headers.get(
                "content-type"
            )

            replay_js = """
            var callback = arguments[arguments.length - 1];
            var url = arguments[0];
            var headData = arguments[1]
            var bodyData = arguments[2];
            var cType = arguments[3];

            fetch(url, {
                method: "POST",
                headers: headData,
                body: bodyData
            })
            .then(response => response.json())
            .then(data => callback(data))
            .catch(error => callback({"error": error.toString()}));
            """

            while True:
                api_url = f"{settings.API_BASE_URL}?apiKey={settings.API_KEY_COSING}&text=*&pageSize={settings.PAGE_SIZE}&pageNumber={page_number}"
                response_data = self.driver.execute_async_script(
                    replay_js, api_url, captured_headers, captured_body, content_type
                )

                if "error" in response_data:
                    break

                results = response_data.get("results", [])
                if not results:
                    break

                all_results.extend(results)

                if len(results) < settings.PAGE_SIZE:
                    break

                page_number += 1
                time.sleep(0.2)

        except Exception as e:
            APP_LOGGER.exception(f"Annex Scrape Error: {e}")

        # E. Process and Cache Results
        annex_map = {}
        for item in all_results:
            meta = item.get("metadata", {})
            ref_no = meta.get("refNo")
            if isinstance(ref_no, list):
                ref_no = ref_no[0] if ref_no else None

            if ref_no:
                clean_ref = str(ref_no).strip().upper()
                annex_map[clean_ref] = meta

        APP_LOGGER.info(f"Cached {len(annex_map)} items for Annex {annex_roman}")
        self.annex_cache[annex_roman] = annex_map
        return annex_map

    def find_exact_match(self, input_name, results):
        """Filters results for exact INCI match."""
        if not results:
            return []
        normalized = str(input_name).strip().upper()
        return [
            item
            for item in results
            if "".join(item.get("metadata", {}).get("inciName", "")).strip().upper()
            == normalized
        ]

    def close(self):
        if self.driver:
            self.driver.quit()
            self.driver = None

    def __del__(self):
        try:
            if self.driver:
                self.driver.quit()
        except Exception:
            pass
