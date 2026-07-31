# app/services/google_sheets_service.py
import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from fastapi import HTTPException
from app.core.logger_config import APP_LOGGER


class GoogleSheetsService:
    def __init__(self, token_path: str):
        if not os.path.exists(token_path):
            raise FileNotFoundError(f"OAuth token missing at {token_path}")

        # NEW: Load the OAuth token instead of a Service Account!
        self.creds = Credentials.from_authorized_user_file(token_path)

        self.sheets_api = build("sheets", "v4", credentials=self.creds)
        self.drive_api = build("drive", "v3", credentials=self.creds)

    def create_edit_sheet(self, data: list[dict], filename: str) -> tuple[str, str]:
        """Creates a sheet at the dedicated account root, populates it, locks headers, and makes it public editable."""
        if not data:
            raise ValueError("No data provided to populate sheet.")

        try:
            # 1. Create Blank Sheet
            spreadsheet = (
                self.sheets_api.spreadsheets()
                .create(body={"properties": {"title": f"[Edit] {filename}"}})
                .execute()
            )

            sheet_id = spreadsheet.get("spreadsheetId")
            sheet_url = spreadsheet.get("spreadsheetUrl")

            # 2. Format Data into a 2D Array
            headers = list(data[0].keys())
            values = [headers] + [
                [str(row.get(h, "")) for h in headers] for row in data
            ]

            # 3. Batch Update: Write Data & Lock First Row
            batch_update_body = {
                "valueInputOption": "RAW",
                "data": [{"range": "Sheet1", "values": values}],
            }
            self.sheets_api.spreadsheets().values().batchUpdate(
                spreadsheetId=sheet_id, body=batch_update_body
            ).execute()

            # Protect Header Row
            sheet_metadata = (
                self.sheets_api.spreadsheets().get(spreadsheetId=sheet_id).execute()
            )
            grid_id = sheet_metadata["sheets"][0]["properties"]["sheetId"]

            protect_req = {
                "requests": [
                    {
                        "addProtectedRange": {
                            "protectedRange": {
                                "range": {
                                    "sheetId": grid_id,
                                    "startRowIndex": 0,
                                    "endRowIndex": 1,
                                },
                                "description": "Locked Headers",
                                "warningOnly": False,
                            }
                        }
                    }
                ]
            }
            self.sheets_api.spreadsheets().batchUpdate(
                spreadsheetId=sheet_id, body=protect_req
            ).execute()

            # 4. Make it Publicly Editable
            self.drive_api.permissions().create(
                fileId=sheet_id, body={"type": "anyone", "role": "writer"}
            ).execute()

            return sheet_id, sheet_url

        except Exception as e:
            APP_LOGGER.exception(f"Google Sheets Creation Error: {e}")
            raise HTTPException(
                status_code=500, detail="Failed to generate Google Sheet."
            )

    def export_sheet_to_csv(self, sheet_id: str, dest_path: str):
        """Downloads the sheet strictly as a pure CSV."""
        try:
            request = self.drive_api.files().export_media(
                fileId=sheet_id, mimeType="text/csv"
            )
            with open(dest_path, "wb") as fh:
                downloader = MediaIoBaseDownload(fh, request)
                done = False
                while not done:
                    status, done = downloader.next_chunk()
        except Exception as e:
            APP_LOGGER.exception(f"Failed to download Sheet {sheet_id}: {e}")
            raise HTTPException(
                status_code=500, detail="Failed to fetch data from Google Drive."
            )

    def delete_sheet(self, sheet_id: str):
        """Deletes the temporary sheet."""
        try:
            # This skips the trash and permanently deletes it immediately!
            self.drive_api.files().delete(fileId=sheet_id).execute()
        except Exception as e:
            APP_LOGGER.error(f"Failed to delete sheet {sheet_id}: {e}")
