# app/models/scraper.py
from typing import Optional, List, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Column, JSON, Relationship, ForeignKey, Integer
from datetime import datetime, timezone


# This prevents circular imports when referencing User for type hinting
if TYPE_CHECKING:
    from app.models.user import User

class ScrapeJob(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    status: str = Field(default="pending") # pending, processing, completed, failed
    filename: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Store results as a JSON blob or a link to a new file
    results: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    result_count: int = Field(default=0)
    error_message: Optional[str] = Field(default=None)
    user_id: Optional[int] = Field(
        sa_column=Column(
            Integer, 
            ForeignKey("user.id", ondelete="CASCADE"), 
            nullable=False
        )
    )
    # This allows you to do `job.owner` to get user details
    owner: Optional["User"] = Relationship(back_populates="jobs")