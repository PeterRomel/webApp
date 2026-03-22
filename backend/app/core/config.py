# app/core/config.py
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DEBUG: bool = False
    PROJECT_NAME: str = "My Web App"
    DATABASE_URL: str
    SECRET_KEY: str  # For JWT tokens
    API_KEY_COSING: str
    ALGORITHM: str = "HS256"
    REDIS_URL_CELERY: str = "redis://localhost:6379/0"      # DB 0 for Task Queue
    REDIS_URL_BLACKLIST: dict = Field(default_factory=lambda: {
        "host": "localhost",
        "port": 6379,
        "db": 1,
        "decode_responses": True
    })
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    UPLOAD_DIR: str = str(Path(__file__).resolve().parent.parent.parent / "uploads")
    CHROME_DRIVER_PATH: str = "/usr/bin/chromedriver"
    CHROME_BROWSER_PATH: str = "/usr/bin/chromium-browser" 
    ANNEX_START_URL: str =  "https://ec.europa.eu/growth/tools-databases/cosing/reference/annexes/list/"
    SEARCH_START_URL: str = "https://ec.europa.eu/"
    API_BASE_URL: str = "https://api.tech.ec.europa.eu/search-api/prod/rest/search"
    PAGE_SIZE: int = 100

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()