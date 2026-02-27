# app/services/user_service.py
from fastapi import HTTPException, status
from sqlmodel import Session, select
from app.models.user import User, UserCreate, UserUpdate
from app.core.security import hash_password, verify_password

class UserService:
    def __init__(self, session: Session):
        self.session = session

    def create(self, user_in: UserCreate) -> User:
        # Check if username already exists
        existing_user = self.session.exec(
            select(User).where(User.username == user_in.username)
        ).first()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this username already exists."
            )

        # Check if email already exists
        existing_email = self.session.exec(
            select(User).where(User.email == user_in.email)
        ).first()
        
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email already exists."
            )
        
        db_user = User(
            username=user_in.username,
            email=user_in.email,
            hashed_password=hash_password(user_in.password)
        )
        self.session.add(db_user)
        self.session.commit()
        self.session.refresh(db_user)
        return db_user

    def get_by_id(self, user_id: int) -> User | None:
        return self.session.get(User, user_id)

    def list_all(self):
        return self.session.exec(select(User)).all()

    def update(self, user_id: int, user_in: UserUpdate) -> User:
        db_user = self.get_by_id(user_id)
        user_data = user_in.model_dump(exclude_unset=True)
        for key, value in user_data.items():
            setattr(db_user, key, value)
        self.session.add(db_user)
        self.session.commit()
        self.session.refresh(db_user)
        return db_user

    def authenticate(self, username: str, password: str) -> User | None:
        # 1. Find user in DB
        statement = select(User).where(User.username == username)
        db_user = self.session.exec(statement).first()
        
        if not db_user:
            return None
        
        # 2. Check password
        if not verify_password(password, db_user.hashed_password):
            return None

        return db_user

    def delete(self, user_id: int):
        db_user = self.get_by_id(user_id)
        self.session.delete(db_user)
        self.session.commit()