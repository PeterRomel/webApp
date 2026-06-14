# app/services/user_service.py
import os
import uuid
import shutil
from fastapi import HTTPException, status, UploadFile
from sqlmodel import Session, select
from app.models.user import User, UserCreate, UserUpdate
from app.core.security import hash_password, verify_password
from app.core.config import settings


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
                detail="A user with this email already exists.",
            )

        db_user = User(
            username=self._format_username(user_in.username),
            email=self._format_email(user_in.email),
            hashed_password=hash_password(user_in.password),
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
                detail="No account found with this email address.",
            )

        # 2. Check password
        if not verify_password(password, db_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password. Please try again.",
            )

        return db_user

    def delete(self, user_id: int):
        db_user = self.get_by_id(user_id)

        if db_user.profile_picture:
            filename = db_user.profile_picture.split("/")[-1]
            filepath = os.path.join(settings.AVATAR_DIR, filename)
            if os.path.exists(filepath):
                os.remove(filepath)
        self.session.delete(db_user)
        self.session.commit()

    def update_avatar(self, user_id: int, file: UploadFile) -> User:
        # 1. Validate file type
        allowed_types = ["image/jpeg", "image/png", "image/webp"]
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file type. Only JPG, PNG, and WebP are allowed.",
            )

        db_user = self.get_by_id(user_id)
        if not db_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
            )

        # 2. Create a unique filename
        # file.filename could be "my_picture.JPG", so we extract the ".JPG" and make it lowercase
        file_extension = os.path.splitext(file.filename)[1].lower()
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(settings.AVATAR_DIR, unique_filename)

        # 3. Save the new image to disk
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 4. Delete the OLD avatar from disk if they had one
        if db_user.profile_picture:
            old_filename = db_user.profile_picture.split("/")[-1]
            old_filepath = os.path.join(settings.AVATAR_DIR, old_filename)
            if os.path.exists(old_filepath):
                os.remove(old_filepath)

        # 5. Save the URL path to the database
        db_user.profile_picture = f"/api/avatars/{unique_filename}"
        self.session.add(db_user)
        self.session.commit()
        self.session.refresh(db_user)

        return db_user
