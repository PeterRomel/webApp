# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from app.api import user, scraper
from app.db.engine import engine
from sqlmodel import SQLModel
from app.core.logger_config import APP_LOGGER

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup code
    SQLModel.metadata.create_all(engine)
    yield
    # Shutdown code (if any) can go here

app = FastAPI(title="Peter's Webapp", lifespan=lifespan)

# --- CUSTOM EXCEPTION HANDLER ---
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Catch Pydantic validation errors and remove the 'input' field 
    to prevent leaking sensitive data like passwords.
    """
    errors = []
    for error in exc.errors():
        # Create a clean version of the error without the 'input' key
        clean_error = {
            "loc": error.get("loc"),
            "msg": error.get("msg"),
            "type": error.get("type"),
        }
        errors.append(clean_error)

    # Log the full error for your eyes only
    APP_LOGGER.error(f"Validation Error: {exc.errors()}")

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": errors},
    )

# --- GLOBAL EXCEPTION HANDLER ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catch ALL unhandled exceptions. This prevents the server from crashing silently 
    and ensures the full traceback goes through our custom APP_LOGGER for systemd.
    """
    # .exception() automatically captures and prints the full traceback
    APP_LOGGER.exception(f"Unhandled Server Error on {request.method} {request.url}")

    # Return a generic 500 error to the client without leaking internal code secrets
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred. Please try again later."},
    )


# --- MIDDLEWARE ---
# Define which origins can talk to your backend
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://peterromel.tplinkdns.com",
    "https://192.168.1.10",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # Allow all methods (GET, POST, etc.)
    allow_headers=["*"], # Allow all headers
)

# --- ROUTES ---
app.include_router(user.router, prefix="/api")
app.include_router(scraper.router, prefix="/api")