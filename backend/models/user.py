"""User model for LiquiFi — SQLAlchemy model with PostgreSQL support."""

import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum
from typing import Optional

from sqlalchemy import Column, String, DateTime, Boolean, Enum, Index, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, Session
from sqlalchemy.sql import func

import auth

import logging
logger = logging.getLogger("liquifi.user")

# SQLAlchemy Base — use shared base if exists, otherwise create one
try:
    from models.database import Base
except ImportError:
    Base = declarative_base()


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class UserRole(str, PyEnum):
    """User role enumeration for RBAC."""
    ADMIN = "admin"
    TRADER = "trader"
    ANALYST = "analyst"
    VIEWER = "viewer"


# ---------------------------------------------------------------------------
# User Model
# ---------------------------------------------------------------------------
class User(Base):
    """User model for authentication and authorization."""
    
    __tablename__ = "users"
    
    # Primary key using UUID for security (non-sequential)
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Authentication fields
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    
    # Role-based access control
    role = Column(Enum(UserRole), nullable=False, default=UserRole.VIEWER)
    
    # Status flags
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
    
    # Profile (optional)
    full_name = Column(String(255), nullable=True)
    
    # Metadata
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    
    # Indexes
    __table_args__ = (
        Index("ix_users_email_active", "email", "is_active"),
        Index("ix_users_role", "role"),
    )
    
    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"
    
    # -----------------------------------------------------------------------
    # Password methods
    # -----------------------------------------------------------------------
    def set_password(self, password: str) -> None:
        """Hash and set the user's password."""
        self.password_hash = auth.hash_password(password)
    
    def verify_password(self, password: str) -> bool:
        """Verify a password against the stored hash."""
        return auth.verify_password(password, self.password_hash)
    
    # -----------------------------------------------------------------------
    # Role checking methods
    # -----------------------------------------------------------------------
    def is_admin(self) -> bool:
        """Check if user has admin role."""
        return self.role == UserRole.ADMIN
    
    def has_role(self, role: UserRole) -> bool:
        """Check if user has a specific role."""
        return self.role == role
    
    def has_any_role(self, roles: list[UserRole]) -> bool:
        """Check if user has any of the specified roles."""
        return self.role in roles
    
    def can_trade(self) -> bool:
        """Check if user has trading permissions."""
        return self.role in (UserRole.ADMIN, UserRole.TRADER)
    
    def can_analyze(self) -> bool:
        """Check if user has analysis permissions."""
        return self.role in (UserRole.ADMIN, UserRole.TRADER, UserRole.ANALYST)
    
    # -----------------------------------------------------------------------
    # Activity tracking
    # -----------------------------------------------------------------------
    def record_login(self, db: Session) -> None:
        """Update last login timestamp."""
        self.last_login = datetime.now(timezone.utc)
        db.commit()
    
    def record_failed_login(self, db: Session) -> None:
        """Record a failed login attempt."""
        self.failed_login_attempts = (self.failed_login_attempts or 0) + 1
        db.commit()
    
    def to_dict(self, include_sensitive: bool = False) -> dict:
        """Convert user to dictionary."""
        data = {
            "id": str(self.id),
            "email": self.email,
            "role": self.role.value,
            "is_active": self.is_active,
            "is_verified": self.is_verified,
            "full_name": self.full_name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None,
        }
        if include_sensitive:
            data["updated_at"] = self.updated_at.isoformat() if self.updated_at else None
        return data


# ---------------------------------------------------------------------------
# Pydantic Schemas (for API validation)
# ---------------------------------------------------------------------------
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserBase(BaseModel):
    """Base user schema with common fields."""
    email: EmailStr
    full_name: Optional[str] = None
    role: UserRole = UserRole.VIEWER


class UserCreate(UserBase):
    """Schema for creating a new user."""
    password: str = Field(..., min_length=8, max_length=128)
    
    model_config = ConfigDict(json_schema_extra={
        "example": {
            "email": "user@example.com",
            "password": "securepassword123",
            "full_name": "John Doe",
            "role": "trader"
        }
    })


class UserUpdate(BaseModel):
    """Schema for updating user fields."""
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    
    model_config = ConfigDict(json_schema_extra={
        "example": {
            "full_name": "Jane Doe",
            "role": "analyst"
        }
    })


class UserResponse(UserBase):
    """Schema for user response (excludes sensitive data)."""
    id: uuid.UUID
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)


class UserInDB(UserBase):
    """Internal schema with all fields including password hash."""
    id: uuid.UUID
    password_hash: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)


class PasswordChange(BaseModel):
    """Schema for password change request."""
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


# ---------------------------------------------------------------------------
# Database helper functions
# ---------------------------------------------------------------------------
def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get a user by email address."""
    return db.query(User).filter(User.email == email.lower().strip()).first()


def get_user_by_id(db: Session, user_id: uuid.UUID) -> Optional[User]:
    """Get a user by ID."""
    return db.query(User).filter(User.id == user_id).first()


def create_user(db: Session, user_data: UserCreate) -> User:
    """Create a new user with hashed password."""
    user = User(
        email=user_data.email.lower().strip(),
        full_name=user_data.full_name,
        role=user_data.role,
    )
    user.set_password(user_data.password)
    
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user: User, user_data: UserUpdate) -> User:
    """Update user fields."""
    update_data = user_data.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(user, field, value)
    
    db.commit()
    db.refresh(user)
    return user


def change_password(db: Session, user: User, new_password: str) -> None:
    """Change user's password."""
    user.set_password(new_password)
    db.commit()


def deactivate_user(db: Session, user: User) -> None:
    """Deactivate a user account."""
    user.is_active = False
    db.commit()


def reactivate_user(db: Session, user: User) -> None:
    """Reactivate a user account."""
    user.is_active = True
    db.commit()


# ---------------------------------------------------------------------------
# Database setup utilities
# ---------------------------------------------------------------------------
def init_user_tables(engine) -> None:
    """Create user tables in the database."""
    Base.metadata.create_all(bind=engine, tables=[User.__table__])


def create_default_admin(db: Session) -> Optional[User]:
    """Create a default admin user if no users exist."""
    existing = db.query(User).first()
    if existing:
        return None
    
    import os
    admin_email = os.getenv("LIQUIFI_ADMIN_EMAIL", "admin@liquifi.local")
    admin_password = os.getenv("LIQUIFI_ADMIN_PASSWORD", "")
    if not admin_password:
        if os.getenv("LIQUIFI_ENV", "development") == "production":
            raise ValueError("LIQUIFI_ADMIN_PASSWORD must be set in production")
        import secrets
        admin_password = secrets.token_urlsafe(16)
        logger.warning("Generated random admin password (set LIQUIFI_ADMIN_PASSWORD to override). Password printed to stderr.")
        import sys
        print(f"ADMIN PASSWORD: {admin_password}", file=sys.stderr)
    
    admin = User(
        email=admin_email,
        full_name="System Administrator",
        role=UserRole.ADMIN,
        is_verified=True,
        is_active=True,
    )
    admin.set_password(admin_password)
    
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin
