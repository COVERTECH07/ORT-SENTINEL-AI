import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Badge, DailyStats, User, UserBadge, WasteEntry


def persist_daily_stats(db: Session, entry: WasteEntry) -> None:
    event_day = entry.created_at.date()
    stats = db.scalar(select(DailyStats).where(DailyStats.stat_date == event_day))
    if stats is None:
        stats = DailyStats(
            stat_date=event_day,
            total_waste_grams=0,
            saved_grams=0,
            event_count=0,
            high_waste_count=0,
            low_waste_count=0,
        )
        db.add(stats)
        db.flush()
    stats.total_waste_grams += entry.weight_grams or entry.amount_kg * 1000
    stats.saved_grams += entry.saved_grams or 0
    stats.event_count += 1
    if entry.status == "high_waste":
        stats.high_waste_count += 1
    else:
        stats.low_waste_count += 1
    stats.updated_at = datetime.now(timezone.utc)


def persist_user_badges(db: Session, user: User) -> None:
    for name in user.badges or []:
        code = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        badge = db.scalar(select(Badge).where(Badge.code == code))
        if badge is None:
            badge = Badge(code=code, name=name)
            db.add(badge)
            db.flush()
        award = db.scalar(
            select(UserBadge).where(
                UserBadge.user_id == user.id,
                UserBadge.badge_id == badge.id,
            )
        )
        if award is None:
            db.add(UserBadge(user_id=user.id, badge_id=badge.id))
            db.flush()
