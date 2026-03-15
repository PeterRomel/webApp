# app/services/user_service.py
from fastapi import HTTPException, status
from sqlmodel import Session, select
from app.models.user import User, UserCreate, UserUpdate
from app.core.security import hash_password, verify_password

class UserService:
    def __init__(self, session: Session):
        self.session = session

    def _format_username(self, username: str) -> str:
        # "peter smith" -> "Peter Smith"
        return username.title()
    
    def _format_email(self, email: str) -> str:
        # "peter smith" -> "Peter Smith"
        return email.lower()
    
    def create(self, user_in: UserCreate) -> User:

        # Check if email already exists
        existing_email = self.session.exec(
            select(User).where(User.email == self._format_email(user_in.email))
        ).first()
        
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email already exists."
            )
        
        db_user = User(
            username=self._format_username(user_in.username),
            email=self._format_email(user_in.email),
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
        update_data = user_in.model_dump(exclude_unset=True)
        
        if "username" in update_data:
            db_user.username = self._format_username(update_data["username"])

        if "password" in update_data:
            db_user.hashed_password = hash_password(update_data["password"])
        
        self.session.add(db_user)
        self.session.commit()
        self.session.refresh(db_user)
        return db_user

    def authenticate(self, email: str, password: str) -> User | None:
        # 1. Find user in DB
        statement = select(User).where(User.email == self._format_email(email))
        db_user = self.session.exec(statement).first()
        
        if not db_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account found with this email address."
            )
        
        # 2. Check password
        if not verify_password(password, db_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password. Please try again."
            )

        return db_user

    def delete(self, user_id: int):
        db_user = self.get_by_id(user_id)
        self.session.delete(db_user)
        self.session.commit()