"""FastAPI middleware and dependencies for JWT authentication and RBAC."""

import uuid
from typing import Optional, Callable, Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from jose import JWTError

import auth
from models.user import User, UserRole, get_user_by_id

# ---------------------------------------------------------------------------
# Database dependency (to be provided by main app)
# ---------------------------------------------------------------------------
# The get_db dependency should be defined in the main app or database module
# This is a placeholder that should be overridden
def get_db():
    """Placeholder for database session dependency.
    
    Override this in your main app with your actual get_db dependency.
    Example:
        from database import get_db as db_dependency
        from middleware import auth
        auth.get_db = db_dependency
    """
    raise NotImplementedError("get_db must be configured in main app")


# ---------------------------------------------------------------------------
# Token extraction
# ---------------------------------------------------------------------------
security = auth.JWTBearer()


async def get_token_from_header(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> str:
    """Extract JWT token from Authorization header."""
    return credentials.credentials


async def get_token_from_cookie_or_header(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    """Extract token from header or cookie (for refresh endpoint)."""
    if credentials:
        return credentials.credentials
    
    # Try to get from cookie
    token = auth.extract_token_from_cookie(request, "refresh_token")
    if token:
        return token
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No valid token provided",
        headers={"WWW-Authenticate": "Bearer"},
    )


# ---------------------------------------------------------------------------
# Current user dependency
# ---------------------------------------------------------------------------
async def get_current_user(
    token: str = Depends(get_token_from_header),
    db = Depends(get_db),
) -> User:
    """
    Dependency to get the current authenticated user.
    
    Usage:
        @app.get("/protected")
        async def protected_route(current_user: User = Depends(get_current_user)):
            return {"message": f"Hello {current_user.email}"}
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = auth.decode_token(token)
        
        # Verify this is an access token, not a refresh token
        if not auth.verify_token_type(payload, "access"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type. Use access token.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        
        user_id = uuid.UUID(user_id_str)
        
        # Check if token has been revoked
        jti = payload.get("jti")
        if jti and auth.is_token_revoked(jti):
            raise credentials_exception
            
    except (JWTError, ValueError):
        raise credentials_exception
    
    user = get_user_by_id(db, user_id)
    if user is None:
        raise credentials_exception
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )
    
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Get current user and verify they are active."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return current_user


async def get_optional_user(
    request: Request,
    db = Depends(get_db),
) -> Optional[User]:
    """
    Get current user if authenticated, otherwise return None.
    Useful for endpoints that work for both authenticated and anonymous users.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    
    token = auth_header.split(" ")[1]
    
    try:
        payload = auth.decode_token(token)
        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            return None
        
        user_id = uuid.UUID(user_id_str)
        user = get_user_by_id(db, user_id)
        
        if user and user.is_active:
            return user
        return None
    except (JWTError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Role-based access control (RBAC)
# ---------------------------------------------------------------------------
def require_role(required_role: UserRole) -> Callable:
    """
    Create a dependency that requires a specific role.
    
    Usage:
        @app.get("/admin-only")
        async def admin_only(user: User = Depends(require_role(UserRole.ADMIN))):
            return {"message": "Admin access granted"}
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required role: {required_role.value}",
            )
        return current_user
    return role_checker


def require_any_role(required_roles: list[UserRole]) -> Callable:
    """
    Create a dependency that requires any of the specified roles.
    
    Usage:
        @app.get("/trading")
        async def trading(user: User = Depends(require_any_role([UserRole.ADMIN, UserRole.TRADER]))):
            return {"message": "Trading access granted"}
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in required_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {[r.value for r in required_roles]}",
            )
        return current_user
    return role_checker


def require_min_role(min_role: UserRole) -> Callable:
    """
    Create a dependency that requires at least the specified role level.
    Role hierarchy: VIEWER < ANALYST < TRADER < ADMIN
    
    Usage:
        @app.get("/analysis")
        async def analysis(user: User = Depends(require_min_role(UserRole.ANALYST))):
            return {"message": "Analysis access granted"}
    """
    role_hierarchy = {
        UserRole.VIEWER: 0,
        UserRole.ANALYST: 1,
        UserRole.TRADER: 2,
        UserRole.ADMIN: 3,
    }
    
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        user_level = role_hierarchy.get(current_user.role, -1)
        required_level = role_hierarchy.get(min_role, 999)
        
        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Minimum role required: {min_role.value}",
            )
        return current_user
    return role_checker


# ---------------------------------------------------------------------------
# Permission-specific dependencies
# ---------------------------------------------------------------------------
require_admin = require_role(UserRole.ADMIN)
require_trader = require_any_role([UserRole.ADMIN, UserRole.TRADER])
require_analyst = require_any_role([UserRole.ADMIN, UserRole.TRADER, UserRole.ANALYST])


# ---------------------------------------------------------------------------
# Middleware for request logging with user info
# ---------------------------------------------------------------------------
class AuthLoggingMiddleware:
    """Middleware to log requests with authenticated user information."""
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        # Extract user info from request if possible
        request = Request(scope, receive)
        user_id = None
        
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            try:
                payload = auth.decode_token(token)
                user_id = payload.get("sub")
            except JWTError:
                pass
        
        # Add user info to scope for logging
        scope["user_id"] = user_id
        
        await self.app(scope, receive, send)


# ---------------------------------------------------------------------------
# Helper functions for route handlers
# ---------------------------------------------------------------------------
def check_ownership(current_user: User, resource_owner_id: uuid.UUID) -> bool:
    """Check if current user owns a resource or is an admin."""
    return current_user.is_admin() or current_user.id == resource_owner_id


def require_ownership(current_user: User, resource_owner_id: uuid.UUID) -> None:
    """Require that current user owns a resource or raise 403."""
    if not check_ownership(current_user, resource_owner_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this resource",
        )
