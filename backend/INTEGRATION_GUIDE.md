# JWT Authentication Integration Guide

This guide explains how to integrate the JWT authentication system into the LiquiFi FastAPI application.

## Files Created

1. **`auth.py`** - Core authentication module with JWT and password hashing
2. **`models/user.py`** - SQLAlchemy User model with RBAC
3. **`models/database.py`** - Database configuration
4. **`middleware/auth.py`** - FastAPI middleware and dependencies
5. **`routers/auth.py`** - Authentication API endpoints

## Quick Setup

### 1. Environment Variables

Add to your `.env` file:

```bash
# JWT Secret (generate with: openssl rand -hex 32)
LIQUIFI_JWT_SECRET=your-super-secret-jwt-key-here

# Database
DATABASE_URL=postgresql://liquifi:liquifi@localhost:5432/liquifi
# Or for development with SQLite:
# LIQUIFI_USE_SQLITE=true

# Admin User (created on first run)
LIQUIFI_ADMIN_EMAIL=admin@liquifi.local
LIQUIFI_ADMIN_PASSWORD=change-this-password
```

### 2. Install Dependencies

```bash
cd /Users/mrinal/Documents/Treasury+Automation+App/backend
pip install -r requirements.txt
```

### 3. Initialize Database

```bash
# Run in Python shell or create a setup script
from models.database import init_database_with_defaults
init_database_with_defaults()
```

### 4. Integrate with main.py

Add to your `main.py`:

```python
from fastapi import FastAPI, Depends
from contextlib import asynccontextmanager

# Import auth components
from models.database import init_database_with_defaults, get_db
from middleware.auth import get_current_user, require_admin
from routers.auth import router as auth_router
from models.user import User

# Update lifespan to initialize database
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database and create default admin
    init_database_with_defaults()
    
    # ... rest of your startup code ...
    yield
    # ... shutdown code ...

# Create app
app = FastAPI(title="LiquiFi Backend", version="2.0.0", lifespan=lifespan)

# Include auth router
app.include_router(auth_router)

# Configure middleware.auth.get_db to use models.database.get_db
import middleware.auth as auth_middleware
auth_middleware.get_db = get_db

# Example protected route
@app.get("/protected")
async def protected_route(current_user: User = Depends(get_current_user)):
    return {"message": f"Hello {current_user.email}"}

# Example admin-only route
@app.get("/admin-only")
async def admin_only(admin: User = Depends(require_admin)):
    return {"message": "Admin access granted"}
```

## API Endpoints

### Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/login` | Login with email/password | No |
| POST | `/auth/login/cookie` | Login with cookie-based refresh | No |
| POST | `/auth/refresh` | Refresh access token | Refresh token |
| POST | `/auth/logout` | Logout and invalidate tokens | Yes |
| POST | `/auth/register` | Register new account | No |

### User Management

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/auth/me` | Get current user info | Yes |
| PUT | `/auth/me` | Update current user profile | Yes |
| POST | `/auth/me/password` | Change password | Yes |
| GET | `/auth/users` | List all users | Admin |
| GET | `/auth/users/{id}` | Get user by ID | Admin |
| PUT | `/auth/users/{id}` | Update user | Admin |
| DELETE | `/auth/users/{id}` | Deactivate user | Admin |

## Usage Examples

### Login

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@liquifi.local", "password": "admin123"}'
```

Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 900,
  "user": {
    "id": "...",
    "email": "admin@liquifi.local",
    "role": "admin"
  }
}
```

### Access Protected Resource

```bash
curl http://localhost:8000/protected \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

### Refresh Token

```bash
# Refresh using cookie (for browser clients)
curl -X POST http://localhost:8000/auth/refresh \
  -H "Cookie: refresh_token=eyJhbGciOiJIUzI1NiIs..."

# Or using header
curl -X POST http://localhost:8000/auth/refresh \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

## User Roles

| Role | Permissions |
|------|-------------|
| `admin` | Full access to all resources and user management |
| `trader` | Can execute trades and view analysis |
| `analyst` | Can view and create analysis, no trading |
| `viewer` | Read-only access |

## Role-Based Access Control

```python
from middleware.auth import (
    require_admin,
    require_trader,
    require_analyst,
    require_role,
    require_any_role,
    require_min_role,
)

# Require specific role
@app.get("/admin")
async def admin_only(user: User = Depends(require_admin)):
    pass

# Require any of multiple roles
@app.get("/trading")
async def trading(user: User = Depends(require_any_role(["admin", "trader"]))):
    pass

# Require minimum role level (hierarchy: viewer < analyst < trader < admin)
@app.get("/analysis")
async def analysis(user: User = Depends(require_min_role("analyst"))):
    pass
```

## Security Features

1. **Token Expiration**: Access tokens expire in 15 minutes, refresh tokens in 7 days
2. **Token Rotation**: Refresh tokens are rotated on each use
3. **Token Revocation**: Logout invalidates tokens immediately
4. **HTTP-Only Cookies**: Refresh tokens stored in secure, HTTP-only cookies
5. **Password Hashing**: bcrypt with automatic salt generation
6. **UUID Primary Keys**: Non-sequential IDs for security

## Testing

```python
# tests/test_auth.py
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_login():
    response = client.post("/auth/login", json={
        "email": "admin@liquifi.local",
        "password": "admin123"
    })
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_protected_without_auth():
    response = client.get("/protected")
    assert response.status_code == 403

def test_protected_with_auth():
    # First login
    login = client.post("/auth/login", json={
        "email": "admin@liquifi.local",
        "password": "admin123"
    })
    token = login.json()["access_token"]
    
    # Access protected route
    response = client.get("/protected", headers={
        "Authorization": f"Bearer {token}"
    })
    assert response.status_code == 200
```

## Production Considerations

1. **Use strong JWT secret**: Generate with `openssl rand -hex 32`
2. **Enable HTTPS**: Set `LIQUIFI_REQUIRE_HTTPS=true`
3. **Use PostgreSQL**: Set proper `DATABASE_URL`
4. **Change default admin password**: Set `LIQUIFI_ADMIN_PASSWORD`
5. **Token cleanup**: The in-memory token blacklist clears every 24 hours
6. **Consider Redis**: For production, implement Redis-based token blacklist
