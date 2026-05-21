"""
Dashboard Routes - Usage tracking and analytics endpoints
"""
from fastapi import APIRouter
from typing import Optional

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/summary")
async def get_summary(period: str = "7d"):
    """Get usage summary (KPI cards data)"""
    from services.db_service import get_db_service
    
    db = get_db_service()
    if not db or not db.is_connected:
        return {
            "total_requests": 0,
            "total_users": 0,
            "total_tokens": 0,
            "total_cost": 0,
            "errors": 0,
            "period_days": _parse_period(period),
            "db_status": "disconnected"
        }
    
    return db.get_usage_summary(period_days=_parse_period(period))


@router.get("/users")
async def get_users(period: str = "7d"):
    """Get per-user usage breakdown"""
    from services.db_service import get_db_service
    
    db = get_db_service()
    if not db or not db.is_connected:
        return []
    
    return db.get_usage_by_user(period_days=_parse_period(period))


@router.get("/actions")
async def get_actions(period: str = "7d"):
    """Get per-action usage breakdown"""
    from services.db_service import get_db_service
    
    db = get_db_service()
    if not db or not db.is_connected:
        return []
    
    return db.get_usage_by_action(period_days=_parse_period(period))


def _parse_period(period: str) -> int:
    """Parse period string to days: '7d' -> 7, '30d' -> 30"""
    try:
        if period.endswith('d'):
            return int(period[:-1])
        return int(period)
    except (ValueError, TypeError):
        return 7
