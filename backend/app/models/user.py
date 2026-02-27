# app/models/user.py
#from app.models.scraper import ScrapeJob
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship
from typing import List

class UserBase(SQLModel):
    username: str = Field(index=True, unique=True)
    email: str = Field(unique=True)

class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_password: str
    # This allows you to do `user.jobs` to see all their past scrapes
    jobs: List["ScrapeJob"] = Relationship(back_populates="owner")

class UserCreate(UserBase):
    password: str

class UserUpdate(SQLModel):
    username: Optional[str] = None
    email: Optional[str] = None