"""Core authentication module for LiquiFi — JWT tokens, password hashing, and user auth."""

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SECRET_KEY = os.getenv("LIQUIFI_JWT_SECRET", "")
if not SECRET_KEY:
    import secrets
    import logging
    logging.getLogger("liquifi.auth").warning(
        "LIQUIFI_JWT_SECRET not set — using random secret. "
        "Set LIQUIFI_JWT_SECRET env var for production persistence."
    )
    SECRET_KEY = secrets.token_urlsafe(32)

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plain-text password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against a hashed password."""
    return pwd_context.verify(plain_password, hashed_password)


# ---------------------------------------------------------------------------
# JWT Token creation and validation
# ---------------------------------------------------------------------------
def create_access_token(
    data: dict[str, Any],
    expires_delta: Optional[timedelta] = None
) -> str:
    """Create a JWT access token with optional custom expiry."""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
        "jti": str(uuid.uuid4()),  # Unique token ID for revocation tracking
    })
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(
    data: dict[str, Any],
    expires_delta: Optional[timedelta] = None
) -> str:
    """Create a JWT refresh token with longer expiry."""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "refresh",
        "jti": str(uuid.uuid4()),
    })
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT token. Returns payload or raises JWTError."""
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    return payload


def verify_token_type(payload: dict[str, Any], expected_type: str) -> bool:
    """Verify that a token payload has the expected type (access/refresh)."""
    return payload.get("type") == expected_type


# ---------------------------------------------------------------------------
# Token refresh mechanism
# ---------------------------------------------------------------------------
def refresh_access_token(
    refresh_token: str,
    get_user_func: callable
) -> dict[str, Any]:
    """
    Create new access/refresh token pair from a valid refresh token.
    
    Args:
        refresh_token: The refresh JWT token
        get_user_func: Callable that takes user_id and returns user object or None
    
    Returns:
        Dict with new access_token, refresh_token, and token_type
    
    Raises:
        HTTPException: If token is invalid, expired, or user not found
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = decode_token(refresh_token)
        
        # Verify this is a refresh token
        if not verify_token_type(payload, "refresh"):
            raise credentials_exception
        
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        
        # Check if token has been revoked (optional: implement in production)
        jti = payload.get("jti")
        if jti and is_token_revoked(jti):
            raise credentials_exception
            
    except JWTError:
        raise credentials_exception
    
    # Get user from database
    user = get_user_func(user_id)
    if user is None:
        raise credentials_exception
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )
    
    # Create new token pair (refresh token rotation)
    new_access_token = create_access_token(data={"sub": str(user.id), "role": user.role})
    new_refresh_token = create_refresh_token(data={"sub": str(user.id)})
    
    # Revoke the old refresh token
    revoke_token(jti)
    
    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


# ---------------------------------------------------------------------------
# Token revocation (blacklist) - simple in-memory for now
# In production, use Redis or database table
# ---------------------------------------------------------------------------
_revoked_tokens: set[str] = set()
_revoked_at: dict[str, datetime] = {}


def revoke_token(jti: str) -> None:
    """Revoke a token by its JTI (JWT ID)."""
    _revoked_tokens.add(jti)
    _revoked_at[jti] = datetime.now(timezone.utc)


def is_token_revoked(jti: str) -> bool:
    """Check if a token has been revoked."""
    return jti in _revoked_tokens


def cleanup_revoked_tokens(max_age_hours: int = 24) -> int:
    """Clean up old revoked tokens to prevent memory bloat."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    to_remove = [
        jti for jti, revoked_at in _revoked_at.items()
        if revoked_at < cutoff
    ]
    for jti in to_remove:
        _revoked_tokens.discard(jti)
        del _revoked_at[jti]
    return len(to_remove)


# ---------------------------------------------------------------------------
# User authentication
# ---------------------------------------------------------------------------
def authenticate_user(
    email: str,
    password: str,
    get_user_by_email_func: callable
) -> Optional[Any]:
    """
    Authenticate a user by email and password.
    
    Args:
        email: User's email address
        password: Plain-text password
        get_user_by_email_func: Callable that takes email and returns user object or None
    
    Returns:
        User object if authentication succeeds, None otherwise
    """
    user = get_user_by_email_func(email)
    if not user:
        return None
    if not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def create_user_tokens(user: Any) -> dict[str, Any]:
    """Create access and refresh tokens for a user."""
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role, "email": user.email}
    )
    refresh_token = create_refresh_token(
        data={"sub": str(user.id)}
    )
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "role": user.role,
        }
    }


# ---------------------------------------------------------------------------
# Security utilities
# ---------------------------------------------------------------------------
class JWTBearer(HTTPBearer):
    """FastAPI security scheme for JWT token validation."""
    
    def __init__(self, auto_error: bool = True):
        super().__init__(auto_error=auto_error)
    
    async def __call__(self, request: Request) -> Optional[HTTPAuthorizationCredentials]:
        credentials = await super().__call__(request)
        if credentials:
            if not credentials.scheme == "Bearer":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid authentication scheme. Use Bearer token.",
                )
            return credentials
        return None


def extract_token_from_cookie(request: Request, cookie_name: str = "refresh_token") -> Optional[str]:
    """Extract a token from HTTP-only cookie."""
    return request.cookies.get(cookie_name)


def set_refresh_cookie(response, refresh_token: str) -> None:
    """Set HTTP-only cookie with refresh token."""
    from fastapi.responses import JSONResponse
    
    max_age = REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60  # seconds
    
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=os.getenv("LIQUIFI_ENV", "development") == "production",
        samesite="lax",
        max_age=max_age,
        path="/auth/refresh",
    )


def clear_refresh_cookie(response) -> None:
    """Clear the refresh token cookie."""
    response.delete_cookie(
        key="refresh_token",
        path="/auth/refresh",
    )
