# app/core/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "My Web App"
    DATABASE_URL: str
    SECRET_KEY: str  # For JWT tokens
    API_KEY_COSING: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    ANNEX_START_URL: str =  "https://ec.europa.eu/growth/tools-databases/cosing/reference/annexes/list/"
    SEARCH_START_URL: str = "https://ec.europa.eu/"
    API_BASE_URL: str = "https://api.tech.ec.europa.eu/search-api/prod/rest/search"
    PAGE_SIZE: int = 100

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()