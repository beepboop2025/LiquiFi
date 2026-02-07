"""Middleware package for LiquiFi."""

from middleware.auth import (
    get_current_user,
    get_current_active_user,
    get_optional_user,
    require_role,
    require_any_role,
    require_min_role,
    require_admin,
    require_trader,
    require_analyst,
    check_ownership,
    require_ownership,
    get_db,
)

# Re-export get_db so it can be configured from here
# The actual implementation should be imported from models.database
# and assigned to middleware.auth.get_db in the main app

__all__ = [
    "get_current_user",
    "get_current_active_user",
    "get_optional_user",
    "require_role",
    "require_any_role",
    "require_min_role",
    "require_admin",
    "require_trader",
    "require_analyst",
    "check_ownership",
    "require_ownership",
    "get_db",
]
