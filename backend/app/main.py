# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import user, scraper
from app.db.engine import engine
from sqlmodel import SQLModel

app = FastAPI(title="Arjan-Style API")

# Define which origins can talk to your backend
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # Allow all methods (GET, POST, etc.)
    allow_headers=["*"], # Allow all headers
)

# Create tables on startup
@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)

app.include_router(user.router, prefix="/api")
app.include_router(scraper.router, prefix="/api")