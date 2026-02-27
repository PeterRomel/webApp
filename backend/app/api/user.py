# app/api/user.py
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from app.db.engine import get_session
from app.services.user_service import UserService
from app.models.user import User, UserCreate, UserUpdate
from app.models.scraper import ScrapeJob
from app.core.security import create_access_token
from app.api.deps import get_current_user_id

router = APIRouter(prefix="/users", tags=["Users"])

@router.post("/", response_model=User)
def create_user(user_in: UserCreate, session: Session = Depends(get_session)):
    service = UserService(session)
    return service.create(user_in)

@router.get("/me", response_model=User)
def read_user(
    user_id: int = Depends(get_current_user_id), 
    session: Session = Depends(get_session)
):
    user = UserService(session).get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.get("/", response_model=list[User])
def list_users(session: Session = Depends(get_session)):
    return UserService(session).list_all()

@router.patch("/me", response_model=User)
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
    user_id: int = Depends(get_current_user_id), 
    session: Session = Depends(get_session)
):
    service = UserService(session)
    db_user = service.get_by_id(user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    service.delete(user_id)
    return {"detail": "User deleted successfully"}

@router.post("/login")
def login(user_in: UserCreate, session: Session = Depends(get_session)):
    service = UserService(session)
    user = service.authenticate(user_in.username, user_in.password)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
        
    # Issue the "Boarding Pass"
    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/history")
def get_user_history(
    current_user_id: int = Depends(get_current_user_id), 
    session: Session = Depends(get_session)
):
    # Fetch all jobs belonging to this specific user
    statement = select(ScrapeJob).where(ScrapeJob.user_id == current_user_id)
    results = session.exec(statement).all()
    return results