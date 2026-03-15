import re
from typing import Optional, List, TYPE_CHECKING
from pydantic import EmailStr, field_validator
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from app.models.scraper import ScrapeJob

# --- REUSABLE VALIDATION LOGIC ---

def validate_password_strength(v: str) -> str:
    """Standard security complexity check for new/updated passwords."""
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    if not re.search(r"[A-Z]", v):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not re.search(r"[a-z]", v):
        raise ValueError("Password must contain at least one lowercase letter.")
    if not re.search(r"\d", v):
        raise ValueError("Password must contain at least one digit.")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
        raise ValueError("Password must contain at least one special character.")
    return v

def validate_not_empty(field_name: str, value: str) -> str:
    """Ensures strings are not just empty whitespace."""
    if not value.strip():
        raise ValueError(f"{field_name} cannot be empty or only whitespace.")
    return value

# --- MODELS ---

class UserBase(SQLModel):
    # EmailStr automatically validates 'name@domain.com'
    email: EmailStr = Field(index=True, unique=True)
    username: str = Field(min_length=1)

    @field_validator("username")
    @classmethod
    def check_username(cls, v: str):
        return validate_not_empty("Username", v)

class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_password: str
    
    jobs: List["ScrapeJob"] = Relationship(
        back_populates="owner", 
        sa_relationship_kwargs={"passive_deletes": True}
    )

class UserRead(UserBase):
    id: int

class UserCreate(UserBase):
    password: str

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str):
        return validate_password_strength(v)

class UserLogin(SQLModel):
    """Used strictly for the login endpoint."""
    email: EmailStr
    password: str = Field(min_length=1)

    @field_validator("password", "email")
    @classmethod
    def check_not_empty(cls, v: str):
        # We don't check 'strength' on login, just that it isn't empty
        return validate_not_empty("Field", v)

class UserUpdate(SQLModel):
    username: Optional[str] = Field(default=None, min_length=1)
    password: Optional[str] = Field(default=None)

    @field_validator("username")
    @classmethod
    def check_username_update(cls, v: Optional[str]):
        if v is not None:
            return validate_not_empty("Username", v)
        return v

    @field_validator("password")
    @classmethod
    def check_password_update(cls, v: Optional[str]):
        if v is not None:
            return validate_password_strength(v)
        return v