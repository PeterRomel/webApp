import time
import json
from app.core.scraper_config import split_patterns
from app.core.logger_config import APP_LOGGER
from app.core.config import settings
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager


class CosingScraper:
    def __init__(self):
        self.driver = None
        self.annex_cache = {} # Cache to store downloaded Annexes
        
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
        return webdriver.Chrome(service=service, options=chrome_options)

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
                    page_number
                )

                if "error" in response_data:
                    APP_LOGGER.error(f"JS Error searching {ingredient_name}: {response_data['error']}")
                    break

                results = response_data.get("results", [])
                if not results:
                    break

                all_results.extend(results)

                # Pagination Check
                if len(results) < settings.PAGE_SIZE:
                    break

                page_number += 1
                time.sleep(0.2) # Small delay to be polite

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
            self.driver.execute_cdp_cmd('Network.enable', {})

            # B. Load Page & Wait for Auto-Search
            self.driver.get(start_url)
            time.sleep(5)

            # C. Intercept Request via Logs
            captured_body = None
            captured_headers = None
            
            logs = self.driver.get_log("performance")
            for entry in logs:
                try:
                    message = json.loads(entry["message"])["message"]
                    if message["method"] == "Network.requestWillBeSent":
                        params = message["params"]
                        request = params["request"]
                        if "search-api/prod/rest/search" in request["url"] and request["method"] == "POST":
                            
                            # Get Post Data
                            if "postData" in request and captured_body_checker in request["postData"]:
                                captured_body = request["postData"]
                            else:
                                # Sometimes body is too large, need explicit retrieval
                                try:
                                    data = self.driver.execute_cdp_cmd('Network.getRequestPostData', {'requestId': params['requestId']})
                                    captured_body = data['postData']
                                    if not captured_body_checker in captured_body:
                                        captured_body = None
                                        continue
                                except:
                                    continue

                            captured_headers = request["headers"]
                            break
                except:
                    continue

            if not captured_body:
                APP_LOGGER.error(f"Could not intercept network signature for Annex {annex_roman}")
                return {}

            # D. Replay Loop using Captured Signature
            page_number = 1
            content_type = captured_headers.get("Content-Type") or captured_headers.get("content-type")

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
                    replay_js, 
                    api_url, 
                    captured_headers, 
                    captured_body, 
                    content_type
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
            meta = item.get('metadata', {})
            ref_no = meta.get('refNo')
            if isinstance(ref_no, list): ref_no = ref_no[0] if ref_no else None
            
            if ref_no:
                clean_ref = str(ref_no).strip().upper()
                annex_map[clean_ref] = meta

        APP_LOGGER.info(f"Cached {len(annex_map)} items for Annex {annex_roman}")
        self.annex_cache[annex_roman] = annex_map
        return annex_map

    def find_exact_match(self, input_name, results):
        """Filters results for exact INCI match."""
        if not results: return []
        normalized = str(input_name).strip().upper()
        return [
            item for item in results 
            if "".join(item.get('metadata', {}).get('inciName', '')).strip().upper() == normalized
        ]

    def close(self):
        if self.driver:
            self.driver.quit()
