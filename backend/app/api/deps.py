# app/api/deps.py
import redis
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.core.security import decode_access_token

# Initialize Redis (use the same Redis you use for Celery)
redis_client = redis.Redis(host="localhost", port=6379, db=0, decode_responses=True)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/users/login")

def get_current_user_id(token: str = Depends(oauth2_scheme)) -> int:
    # 1. CHECK THE BLACKLIST FIRST
    # If the token exists in Redis, it means the user logged out.
    if redis_client.exists(f"blacklist:{token}"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked. Please log in again.",
        )

    # 2. PROCEED WITH NORMAL DECODING
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
    return int(payload["sub"])