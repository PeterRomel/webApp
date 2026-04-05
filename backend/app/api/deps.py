# app/api/deps.py
import redis
import redis.exceptions
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session
from app.core.config import settings
from app.core.security import decode_access_token
from app.core.logger_config import APP_LOGGER
from app.db.engine import get_session
from app.models.user import User

# Initialize Redis
redis_client = redis.Redis(**settings.REDIS_URL_BLACKLIST)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/users/login")

def get_current_user_id(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session)
) -> int:
    
    # 1. PROCEED WITH NORMAL DECODING
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
        
    user_id = int(payload["sub"])

    # 2. CHECK THE BLACKLIST FIRST
    try:
        if redis_client.exists(f"blacklist:{token}"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked. Please log in again.",
            )
    except redis.exceptions.ConnectionError:
        # If Redis is down, log it but don't block the user from accessing the app
        APP_LOGGER.warning("Redis is unreachable. Skipping blacklist check.")
    except redis.exceptions.RedisError as e:
        APP_LOGGER.warning(f"Redis issue. Skipping blacklist check: {e}")

    # 3. STRICT DB CHECK: Does this user still exist?
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists. Please log in again."
        )

    return user_id