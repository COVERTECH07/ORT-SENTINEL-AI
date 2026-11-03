from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from app.deps import CurrentUser, DbDep
from app.models import User, WasteEntry
from app.services.configuration import get_config

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _owner_filter(user: User):
    return [WasteEntry.user_id == user.id] if user.role == "student" else []


def _scope_filters(user: User, meal_type: str | None, user_id: int | None):
    filters = _owner_filter(user)
    if user.role != "student" and user_id is not None:
        filters.append(WasteEntry.user_id == user_id)
    if meal_type:
        filters.append(WasteEntry.meal_type == meal_type.strip().lower())
    return filters


def _range_filters(user: User, start_date: date, end_date: date, meal_type: str | None, user_id: int | None):
    return [
        *_scope_filters(user, meal_type, user_id),
        WasteEntry.created_at >= datetime.combine(start_date, time.min, tzinfo=timezone.utc),
        WasteEntry.created_at < datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=timezone.utc),
    ]


def _percent_change(current: float, previous: float) -> float:
    if previous <= 0:
        return 0.0 if current <= 0 else 100.0
    return round((current - previous) / previous * 100, 1)


@router.get("/stats")
def dashboard_stats(
    db: DbDep,
    user: CurrentUser,
    start_date: date | None = None,
    end_date: date | None = None,
    meal_type: str | None = None,
    user_id: int | None = None,
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    selected_end = end_date or now.date()
    selected_start = start_date or selected_end - timedelta(days=6)
    if selected_end < selected_start:
        raise HTTPException(status_code=422, detail="end_date must be on or after start_date")
    period_days = (selected_end - selected_start).days + 1
    if period_days > 366:
        raise HTTPException(status_code=422, detail="Date range cannot exceed 366 days")
    scope_filters = _scope_filters(user, meal_type, user_id)
    range_filters = _range_filters(user, selected_start, selected_end, meal_type, user_id)
    range_start = datetime.combine(selected_start, time.min, tzinfo=timezone.utc)
    previous_start = range_start - timedelta(days=period_days)

    def sum_grams(*extra_filters) -> float:
        expression = func.coalesce(
            func.sum(func.coalesce(WasteEntry.weight_grams, WasteEntry.amount_kg * 1000)), 0
        )
        return float(db.scalar(select(expression).where(*scope_filters, *extra_filters)) or 0)

    def saved_grams(*extra_filters) -> float:
        return float(db.scalar(
            select(func.coalesce(func.sum(WasteEntry.saved_grams), 0)).where(*scope_filters, *extra_filters)
        ) or 0)

    total_grams = sum_grams()
    filtered_grams = float(db.scalar(
        select(func.coalesce(
            func.sum(func.coalesce(WasteEntry.weight_grams, WasteEntry.amount_kg * 1000)), 0
        )).where(*range_filters)
    ) or 0)
    previous_grams = sum_grams(
        WasteEntry.created_at >= previous_start,
        WasteEntry.created_at < range_start,
    )
    today_grams = sum_grams(WasteEntry.created_at >= today_start)
    yesterday_grams = sum_grams(
        WasteEntry.created_at >= yesterday_start,
        WasteEntry.created_at < today_start,
    )
    filtered_saved = float(db.scalar(
        select(func.coalesce(func.sum(WasteEntry.saved_grams), 0)).where(*range_filters)
    ) or 0)
    previous_saved = saved_grams(
        WasteEntry.created_at >= previous_start,
        WasteEntry.created_at < range_start,
    )
    event_count = int(db.scalar(select(func.count(WasteEntry.id)).where(*scope_filters)) or 0)
    points = int(user.total_points or 0) if user.role == "student" else None
    score = int(user.waste_score or 0) if user.role == "student" else None
    rank = None
    if user.role == "student":
        rank = int(db.scalar(
            select(func.count(User.id)).where(
                User.role == "student",
                User.total_points > (user.total_points or 0),
            )
        ) or 0) + 1

    config = get_config(db)
    saved_kg = round(filtered_saved / 1000, 3)
    money_saved = round(saved_kg * config["money_per_kg"], 2)
    co2_saved = round(saved_kg * config["co2_per_kg"], 3)
    total_kg = round(total_grams / 1000, 3)
    today_kg = round(today_grams / 1000, 3)
    return {
        "total_waste_kg": total_kg,
        "all_time_waste_kg": total_kg,
        "filtered_waste_kg": round(filtered_grams / 1000, 3),
        "range_waste_kg": round(filtered_grams / 1000, 3),
        "waste_today_kg": today_kg,
        "total_waste_today_kg": today_kg,
        "today_waste_kg": today_kg,
        "weekly_waste_kg": round(sum_grams(WasteEntry.created_at >= today_start - timedelta(days=6)) / 1000, 3),
        "average_waste_kg": round(total_kg / event_count, 3) if event_count else 0,
        "entry_count": event_count,
        "event_count": event_count,
        "total_waste_grams": round(total_grams, 2),
        "waste_saved_kg": saved_kg,
        "saved_kg": saved_kg,
        "filtered_saved_kg": saved_kg,
        "money_saved": money_saved,
        "money_saved_inr": money_saved,
        "co2_saved_kg": co2_saved,
        "estimated_co2_kg": co2_saved,
        "estimated_energy_kwh": round(total_kg * config["conversion_factor_kwh_per_kg"], 3),
        "waste_threshold_grams": config["waste_threshold_grams"],
        "waste_threshold_kg": config["waste_threshold_kg"],
        "waste_change_percent": _percent_change(filtered_grams, previous_grams),
        "saved_change_percent": _percent_change(filtered_saved, previous_saved),
        "waste_score": score,
        "total_points": points,
        "rank": rank,
        "badges": user.badges or [] if user.role == "student" else [],
    }


@router.get("/charts")
def dashboard_charts(
    db: DbDep,
    user: CurrentUser,
    days: int = Query(default=7, ge=1, le=365),
    start_date: date | None = None,
    end_date: date | None = None,
    meal_type: str | None = None,
    user_id: int | None = None,
):
    today = datetime.now(timezone.utc).date()
    selected_end = end_date or today
    start_day = start_date or selected_end - timedelta(days=days - 1)
    if selected_end < start_day:
        raise HTTPException(status_code=422, detail="end_date must be on or after start_date")
    period_days = (selected_end - start_day).days + 1
    if period_days > 366:
        raise HTTPException(status_code=422, detail="Date range cannot exceed 366 days")
    filters = _range_filters(user, start_day, selected_end, meal_type, user_id)
    entries = db.scalars(
        select(WasteEntry)
        .where(*filters)
        .order_by(WasteEntry.created_at)
    ).all()

    daily_totals: dict[str, float] = defaultdict(float)
    daily_saved: dict[str, float] = defaultdict(float)
    item_totals: dict[str, float] = defaultdict(float)
    meal_totals: dict[str, float] = defaultdict(float)
    for entry in entries:
        weight = entry.weight_grams if entry.weight_grams is not None else entry.amount_kg * 1000
        day = entry.created_at.date().isoformat()
        daily_totals[day] += weight
        daily_saved[day] += entry.saved_grams or 0
        meal_totals[entry.meal_type] += weight
        items = entry.food_items or [{"name": entry.category or "Mixed meal"}]
        share = weight / len(items)
        for item in items:
            label = str(item.get("name", "Mixed meal")) if isinstance(item, dict) else str(item)
            item_totals[label] += share

    daily = []
    for offset in range(period_days):
        day = (start_day + timedelta(days=offset)).isoformat()
        daily.append({
            "date": day,
            "waste_kg": round(daily_totals[day] / 1000, 3),
            "saved_kg": round(daily_saved[day] / 1000, 3),
        })
    items = [
        {"food_item": name, "name": name, "weight_kg": round(amount / 1000, 3)}
        for name, amount in sorted(item_totals.items(), key=lambda pair: pair[1], reverse=True)
    ]
    meals = [
        {"meal_type": name, "weight_kg": round(amount / 1000, 3)}
        for name, amount in sorted(meal_totals.items(), key=lambda pair: pair[1], reverse=True)
    ]
    return {
        "daily_trend": daily,
        "daily": daily,
        "item_waste": items,
        "items": items,
        "categories": items,
        "meal_distribution": meals,
        "meals": meals,
    }


@router.get("/leaderboard")
def leaderboard(db: DbDep, _: CurrentUser):
    students = db.scalars(
        select(User)
        .where(User.role == "student", User.is_active.is_(True))
        .order_by(User.total_points.desc(), User.waste_score.desc(), User.full_name)
        .limit(100)
    ).all()
    return [
        {
            "id": student.id,
            "name": student.full_name,
            "role": student.role,
            "waste_score": student.waste_score or 0,
            "total_points": student.total_points or 0,
            "total_waste_grams": student.total_waste_grams or 0,
            "badges": student.badges or [],
            "rank": index + 1,
        }
        for index, student in enumerate(students)
    ]
