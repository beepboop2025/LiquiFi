"""Authentication API endpoints for LiquiFi — login, refresh, logout, user info."""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

import auth
import config
from middleware.auth import (
    get_current_user,
    get_db,
    get_token_from_cookie_or_header,
    security,
)
from models.user import (
    User,
    UserCreate,
    UserResponse,
    PasswordChange,
    create_user,
    get_user_by_email,
    get_user_by_id,
    change_password,
    update_user,
)

logger = logging.getLogger("liquifi.auth.router")

# ---------------------------------------------------------------------------
# Router setup
# ---------------------------------------------------------------------------
router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
    responses={
        401: {"description": "Unauthorized"},
        403: {"description": "Forbidden"},
    },
)


# ---------------------------------------------------------------------------
# Request/Response schemas
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    """Login request with email and password."""
    email: EmailStr
    password: str = Field(..., min_length=1)
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "email": "user@example.com",
                "password": "yourpassword"
            }
        }
    }


class TokenResponse(BaseModel):
    """Token response with access token and metadata."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIs...",
                "token_type": "bearer",
                "expires_in": 900,
                "user": {
                    "id": "550e8400-e29b-41d4-a716-446655440000",
                    "email": "user@example.com",
                    "role": "trader"
                }
            }
        }
    }


class RefreshResponse(BaseModel):
    """Refresh token response with new token pair."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIs...",
                "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
                "token_type": "bearer",
                "expires_in": 900
            }
        }
    }


class MessageResponse(BaseModel):
    """Simple message response."""
    message: str


class UserProfileResponse(UserResponse):
    """Extended user profile response."""
    permissions: list[str] = []


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------
def _authenticate_user(email: str, password: str, db: Session) -> Optional[User]:
    """Authenticate user by email and password."""
    user = get_user_by_email(db, email)
    if not user:
        return None
    if not user.verify_password(password):
        user.record_failed_login(db)
        return None
    return user


def _create_token_response(user: User, set_cookie: bool = False) -> tuple[dict, Optional[str]]:
    """Create token response and optionally get refresh token for cookie."""
    tokens = auth.create_user_tokens(user)
    
    response_data = {
        "access_token": tokens["access_token"],
        "token_type": tokens["token_type"],
        "expires_in": tokens["expires_in"],
        "user": tokens["user"],
    }
    
    refresh_token = tokens["refresh_token"] if set_cookie else None
    
    return response_data, refresh_token


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate user and receive tokens",
    description="Authenticate with email and password. Returns access token in JSON and sets HTTP-only cookie with refresh token."
)
async def login(
    request: LoginRequest,
    db: Session = Depends(get_db),
):
    """
    Authenticate a user and return JWT tokens.
    
    - **email**: User's email address
    - **password**: User's password
    
    Returns an access token in the response body and sets an HTTP-only cookie
    with the refresh token for enhanced security.
    """
    user = _authenticate_user(request.email, request.password, db)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Please contact an administrator.",
        )
    
    # Record successful login
    user.record_login(db)
    
    # Create tokens
    response_data, refresh_token = _create_token_response(user, set_cookie=True)
    
    # Build the JSON response and set refresh token cookie on it
    from fastapi.responses import JSONResponse
    token_body = TokenResponse(**response_data)
    response = JSONResponse(content=token_body.model_dump())
    if refresh_token:
        auth.set_refresh_cookie(response, refresh_token)
    
    return response


@router.post(
    "/login/cookie",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate user with cookie-based refresh token"
)
async def login_with_cookie(
    request: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Authenticate and set both tokens in cookies (for browser-based clients).
    """
    user = _authenticate_user(request.email, request.password, db)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )
    
    user.record_login(db)
    
    tokens = auth.create_user_tokens(user)
    
    # Set refresh token as HTTP-only cookie
    auth.set_refresh_cookie(response, tokens["refresh_token"])
    
    return TokenResponse(
        access_token=tokens["access_token"],
        token_type=tokens["token_type"],
        expires_in=tokens["expires_in"],
        user=tokens["user"],
    )


@router.post(
    "/refresh",
    response_model=RefreshResponse,
    status_code=status.HTTP_200_OK,
    summary="Refresh access token",
    description="Exchange a valid refresh token for a new access token pair."
)
async def refresh_token(
    request: Request,
    response: Response,
    token: str = Depends(get_token_from_cookie_or_header),
    db: Session = Depends(get_db),
):
    """
    Refresh the access token using a refresh token.
    
    The refresh token can be provided either:
    - In the Authorization header: `Bearer <refresh_token>`
    - In the HTTP-only cookie (preferred for browser clients)
    
    Returns a new access token and refresh token (token rotation).
    """
    try:
        # Get user lookup function for the refresh mechanism
        def get_user_by_id_str(user_id: str) -> Optional[User]:
            from uuid import UUID
            try:
                return get_user_by_id(db, UUID(user_id))
            except ValueError:
                return None
        
        # Refresh tokens
        result = auth.refresh_access_token(token, get_user_by_id_str)
        
        # Set new refresh token in cookie
        auth.set_refresh_cookie(response, result["refresh_token"])
        
        return RefreshResponse(
            access_token=result["access_token"],
            refresh_token=result["refresh_token"],
            token_type=result["token_type"],
            expires_in=result["expires_in"],
        )
        
    except HTTPException:
        # Clear cookie on refresh failure
        auth.clear_refresh_cookie(response)
        raise


@router.post(
    "/logout",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Logout and invalidate tokens"
)
async def logout(
    request: Request,
    response: Response,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    Logout the current user and invalidate their tokens.
    
    Revokes both the access token (from header) and refresh token (from cookie).
    """
    # Revoke access token
    try:
        payload = auth.decode_token(credentials.credentials)
        jti = payload.get("jti")
        if jti:
            auth.revoke_token(jti)
    except Exception as e:
        logger.warning("Failed to revoke access token during logout: %s", e)
    
    # Try to revoke refresh token from cookie
    refresh_token = auth.extract_token_from_cookie(request, "refresh_token")
    if refresh_token:
        try:
            payload = auth.decode_token(refresh_token)
            jti = payload.get("jti")
            if jti:
                auth.revoke_token(jti)
        except Exception as e:
            logger.warning("Failed to revoke refresh token during logout: %s", e)
    
    # Clear the refresh cookie
    auth.clear_refresh_cookie(response)
    
    return MessageResponse(message="Successfully logged out")


@router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Get current user information"
)
async def get_me(
    current_user: User = Depends(get_current_user),
):
    """
    Get information about the currently authenticated user.
    
    Requires a valid access token in the Authorization header.
    """
    # Build permissions list based on role
    permissions = ["read"]
    if current_user.can_analyze():
        permissions.append("analyze")
    if current_user.can_trade():
        permissions.append("trade")
    if current_user.is_admin():
        permissions.extend(["admin", "write", "delete"])
    
    return UserProfileResponse(
        **current_user.to_dict(),
        permissions=permissions,
    )


@router.put(
    "/me",
    response_model=UserResponse,
    summary="Update current user profile"
)
async def update_me(
    user_update: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update the current user's profile information.
    
    Users can update their own profile but not their role or active status.
    """
    from models.user import UserUpdate
    
    # Only allow updating certain fields for self
    allowed_fields = {"full_name"}
    filtered_data = {k: v for k, v in user_update.items() if k in allowed_fields}
    
    if not filtered_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid fields to update",
        )
    
    update_data = UserUpdate(**filtered_data)
    updated_user = update_user(db, current_user, update_data)
    
    return UserResponse.model_validate(updated_user)


@router.post(
    "/me/password",
    response_model=MessageResponse,
    summary="Change current user password"
)
async def change_password_endpoint(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Change the current user's password.
    
    - **current_password**: Current password for verification
    - **new_password**: New password (min 8 characters)
    """
    # Verify current password
    if not current_user.verify_password(password_data.current_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    
    # Change password
    change_password(db, current_user, password_data.new_password)
    
    return MessageResponse(message="Password changed successfully")


# ---------------------------------------------------------------------------
# Registration (optional, admin-only or open based on configuration)
# ---------------------------------------------------------------------------
@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
    description="Create a new user account. May require admin approval based on configuration."
)
async def register(
    user_data: UserCreate,
    db: Session = Depends(get_db),
):
    """
    Register a new user account.
    
    - **email**: Valid email address
    - **password**: Password (min 8 characters)
    - **full_name**: Optional full name
    - **role**: Defaults to 'viewer', may be restricted
    
    The new user will have `is_verified=False` until approved by an admin.
    """
    # Check if email already exists
    existing = get_user_by_email(db, user_data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    
    # Force role to VIEWER for self-registration (admin can change later)
    # Remove role from input or force it
    user_dict = user_data.model_dump()
    user_dict["role"] = "viewer"  # Force viewer role for self-registration
    
    from models.user import UserRole
    safe_data = UserCreate(**user_dict)
    
    # Create user
    new_user = create_user(db, safe_data)
    new_user.is_verified = False  # Require admin approval
    db.commit()
    
    return UserResponse.model_validate(new_user)


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------
from middleware.auth import require_admin


@router.get(
    "/users",
    response_model=list[UserResponse],
    summary="List all users (admin only)",
    dependencies=[Depends(require_admin)],
)
async def list_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """List all users (admin only)."""
    users = db.query(User).offset(skip).limit(limit).all()
    return [UserResponse.model_validate(u) for u in users]


@router.get(
    "/users/{user_id}",
    response_model=UserResponse,
    summary="Get user by ID (admin only)",
    dependencies=[Depends(require_admin)],
)
async def get_user(
    user_id: str,
    db: Session = Depends(get_db),
):
    """Get a specific user by ID (admin only)."""
    from uuid import UUID
    
    try:
        user = get_user_by_id(db, UUID(user_id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format",
        )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    return UserResponse.model_validate(user)


@router.put(
    "/users/{user_id}",
    response_model=UserResponse,
    summary="Update user (admin only)",
    dependencies=[Depends(require_admin)],
)
async def admin_update_user(
    user_id: str,
    user_update: dict,
    db: Session = Depends(get_db),
):
    """Update any user (admin only)."""
    from uuid import UUID
    from models.user import UserUpdate, deactivate_user, reactivate_user
    
    try:
        user = get_user_by_id(db, UUID(user_id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format",
        )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    # Handle activation/deactivation separately
    if "is_active" in user_update:
        if user_update["is_active"]:
            reactivate_user(db, user)
        else:
            deactivate_user(db, user)
        del user_update["is_active"]
    
    if user_update:
        update_data = UserUpdate(**user_update)
        user = update_user(db, user, update_data)
    
    return UserResponse.model_validate(user)


@router.delete(
    "/users/{user_id}",
    response_model=MessageResponse,
    summary="Deactivate user (admin only)",
    dependencies=[Depends(require_admin)],
)
async def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
):
    """Deactivate a user (admin only). Does not delete, only deactivates."""
    from uuid import UUID
    from models.user import deactivate_user
    
    try:
        user = get_user_by_id(db, UUID(user_id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format",
        )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    if user.is_admin():
        # Prevent deactivating the last admin
        admin_count = db.query(User).filter(User.role == "admin", User.is_active == True).count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate the last admin user",
            )
    
    deactivate_user(db, user)
    
    return MessageResponse(message="User deactivated successfully")
