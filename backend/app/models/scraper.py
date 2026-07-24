# app/models/scraper.py
from typing import Optional, List, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Column, JSON, Relationship, ForeignKey, Integer
from datetime import datetime, timezone

if TYPE_CHECKING:
    from app.models.user import User


class ScrapeJob(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    job_type: str = Field(default="scraper")
    status: str = Field(default="pending")
    filename: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # NEW: The temporary stash for the user's original extra columns
    original_data: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))

    results: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))
    result_count: int = Field(default=0)
    error_message: Optional[str] = Field(default=None)
    user_id: Optional[int] = Field(
        sa_column=Column(
            Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
        )
    )
    owner: Optional["User"] = Relationship(back_populates="jobs")
