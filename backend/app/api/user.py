# app/api/user.py
import time
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select, func
from sqlalchemy.orm import defer
from app.db.engine import get_session
from app.services.user_service import UserService
from app.models.user import User, UserCreate, UserUpdate, UserRead
from app.models.scraper import ScrapeJob
from app.core.security import create_access_token, decode_access_token
from app.api.deps import get_current_user_id, redis_client, oauth2_scheme
import redis.exceptions
from app.core.logger_config import APP_LOGGER

def revoke_token(token: str):
    """Helper function to decode a token and add it to the Redis blacklist."""
    payload = decode_access_token(token)
    
    if payload and "exp" in payload:
        exp_timestamp = payload["exp"]
        current_time = int(time.time())
        seconds_remaining = exp_timestamp - current_time

        # Only blacklist if there is time remaining before it naturally expires
        if seconds_remaining > 0:
            try:
                redis_client.setex(f"blacklist:{token}", seconds_remaining, "true")
            except redis.exceptions.RedisError:
                APP_LOGGER.error("Redis is unreachable. Could not blacklist token.")

router = APIRouter(prefix="/users", tags=["Users"])

@router.post("/register", response_model=UserRead)
def create_user(user_in: UserCreate, session: Session = Depends(get_session)):
    service = UserService(session)
    return service.create(user_in)

@router.get("/me", response_model=UserRead)
def read_user(
    user_id: int = Depends(get_current_user_id), 
    session: Session = Depends(get_session)
):
    user = UserService(session).get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.get("/", response_model=list[UserRead])
def list_users(session: Session = Depends(get_session)):
    return UserService(session).list_all()

@router.patch("/me", response_model=UserRead)
def update_user(
    user_in: UserUpdate,
    session: Session = Depends(get_session),
    user_id: int = Depends(get_current_user_id)
):
    service = UserService(session)
    db_user = service.get_by_id(user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return service.update(user_id, user_in)

@router.delete("/me")
def delete_user(
    token: str = Depends(oauth2_scheme),
    user_id: int = Depends(get_current_user_id), 
    session: Session = Depends(get_session)
):
    service = UserService(session)
    db_user = service.get_by_id(user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # 1. Delete the user from the PostgreSQL database
    service.delete(user_id)
    
    # 2. Add their token to the Redis blacklist (Logout)
    revoke_token(token)
    
    return {"detail": "User deleted and successfully logged out"}

@router.post("/login")
def login(
    # FastAPI will automatically extract 'username' and 'password' from the Form Data
    form_data: OAuth2PasswordRequestForm = Depends(), 
    session: Session = Depends(get_session)
):
    service = UserService(session)
    
    # Note: Even if it's an email, OAuth2 forces the field to be named 'username'
    # So we pass form_data.username to your authenticate function
    user = service.authenticate(form_data.username, form_data.password)
    
    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/history")
def get_user_history(
    page: int = 1,
    limit: int = 20,
    current_user_id: int = Depends(get_current_user_id), 
    session: Session = Depends(get_session)
):
    # 1. Calculate how many items to skip
    offset = (page - 1) * limit
    
    # 2. Get the TOTAL number of jobs for the frontend to calculate Total Pages
    count_statement = select(func.count(ScrapeJob.id)).where(ScrapeJob.user_id == current_user_id)
    total_jobs = session.exec(count_statement).one()

    # 3. Fetch the jobs, but DEFER (ignore) the heavy 'results' JSON column
    statement = select(ScrapeJob).where(ScrapeJob.user_id == current_user_id)\
        .options(defer(ScrapeJob.results))\
        .order_by(ScrapeJob.created_at.desc())\
        .offset(offset).limit(limit)
        
    jobs = session.exec(statement).all()
    
    # Calculate total pages safely
    total_pages = (total_jobs + limit - 1) // limit if total_jobs > 0 else 1

    return {
        "data": jobs,
        "pagination": {
            "current_page": page,
            "total_pages": total_pages,
            "total_jobs": total_jobs,
            "limit": limit
        }
    }

@router.post("/logout")
def logout(
    token: str = Depends(oauth2_scheme),
    current_user_id: int = Depends(get_current_user_id)
):
    revoke_token(token)
    return {"detail": "Successfully logged out. Token has been revoked."}
