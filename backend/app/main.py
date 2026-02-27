# app/main.py
from fastapi import FastAPI
from app.api import user, scraper
from app.db.engine import engine
from sqlmodel import SQLModel

app = FastAPI(title="Arjan-Style API")

# Create tables on startup
@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)

app.include_router(user.router, prefix="/api")
app.include_router(scraper.router, prefix="/api")