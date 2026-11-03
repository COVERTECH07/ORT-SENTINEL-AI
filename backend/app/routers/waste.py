from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.deps import CurrentUser, DbDep
from app.models import User, WasteEntry
from app.schemas import WasteCreate, WasteOut
from app.services.broadcast import broadcaster
from app.services.configuration import get_config
from app.services.inference import detect_food_items
from app.services.persistence import persist_daily_stats, persist_user_badges
from app.services.scoring import record_weight, reward_event

router = APIRouter(prefix="/waste", tags=["waste"])


@router.get("/", response_model=list[WasteOut])
def list_waste(
    db: DbDep,
    user: CurrentUser,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    user_id: int | None = None,
    meal_type: str | None = None,
    status: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    query = select(WasteEntry).options(joinedload(WasteEntry.user))
    if user.role == "student":
        query = query.where(WasteEntry.user_id == user.id)
    elif user_id is not None:
        query = query.where(WasteEntry.user_id == user_id)
    if start_date:
        query = query.where(WasteEntry.created_at >= start_date)
    if end_date:
        query = query.where(WasteEntry.created_at <= end_date)
    if meal_type:
        query = query.where(WasteEntry.meal_type == meal_type.strip().lower())
    if status:
        query = query.where(WasteEntry.status == status.strip().lower())
    entries = db.scalars(query.order_by(WasteEntry.created_at.desc()).offset(offset).limit(limit)).all()
    return [WasteOut.from_entry(entry) for entry in entries]


@router.post("/", response_model=WasteOut, status_code=201)
async def create_waste(payload: WasteCreate, db: DbDep, user: CurrentUser):
    if user.role == "student":
        if payload.user_id is not None and payload.user_id != user.id:
            raise HTTPException(status_code=403, detail="Students can only log waste for themselves")
        if payload.rfid_uid:
            mapped_user = db.scalar(select(User).where(User.rfid_uid == payload.rfid_uid.strip()))
            if mapped_user is not None and mapped_user.id != user.id:
                raise HTTPException(status_code=403, detail="RFID is assigned to another user")
            if mapped_user is None and (user.rfid_uid or "").strip() != payload.rfid_uid.strip():
                raise HTTPException(status_code=403, detail="RFID is not assigned to your account")
        owner = user
    elif payload.rfid_uid:
        owner = db.scalar(select(User).where(User.rfid_uid == payload.rfid_uid.strip()))
        if owner is None:
            raise HTTPException(status_code=404, detail="No user is mapped to this RFID UID")
        if payload.user_id is not None and owner.id != payload.user_id:
            raise HTTPException(status_code=422, detail="user_id and rfid_uid do not identify the same user")
    elif payload.user_id is not None:
        owner = db.get(User, payload.user_id)
        if owner is None:
            raise HTTPException(status_code=404, detail="User not found")
    else:
        owner = None

    weight_grams = float(payload.weight_grams)
    config = get_config(db)
    threshold_grams = config["waste_threshold_grams"]
    reward = reward_event(owner, weight_grams, threshold_grams) if owner else {
        "status": "high_waste" if weight_grams > threshold_grams else "low_waste",
        "points_awarded": 0,
        "points_delta": 0,
        "score_delta": 0,
        "saved_grams": max(0.0, threshold_grams - weight_grams),
    }
    if owner:
        record_weight(owner, weight_grams)
    image_url = payload.image_url
    image_data = payload.image_base64 or payload.image
    if payload.image and payload.image.lower().startswith(("http://", "https://")) and not image_url:
        image_url = payload.image
        image_data = None
    food_items = detect_food_items(image_data or image_url, payload.meal_type)
    if food_items:
        estimated_split = round(weight_grams / len(food_items), 2)
        food_items = [dict(item, estimated_weight_grams=estimated_split) for item in food_items]
    entry = WasteEntry(
        user_id=owner.id if owner else None,
        amount_kg=weight_grams / 1000,
        weight_grams=weight_grams,
        meal_type=payload.meal_type.strip().lower(),
        category=payload.category.strip().lower(),
        notes=payload.notes,
        food_items=food_items,
        image_url=image_url,
        image_data=image_data,
        status=str(reward["status"]),
        points_awarded=int(reward["points_awarded"]),
        points_delta=int(reward["points_delta"]),
        score_delta=int(reward["score_delta"]),
        saved_grams=float(reward["saved_grams"]),
        source="manual",
        created_at=payload.timestamp or payload.date or datetime.now(timezone.utc),
    )
    db.add(entry)
    persist_daily_stats(db, entry)
    if owner:
        persist_user_badges(db, owner)
    db.commit()
    db.refresh(entry)
    result = WasteOut.from_entry(entry)
    await broadcaster.publish({
        "type": "waste.created",
        **result.model_dump(mode="json"),
        "threshold_exceeded": entry.status == "high_waste",
        "score": owner.waste_score if owner else None,
        "total_points": owner.total_points if owner else None,
        "badges": owner.badges if owner else [],
    })
    return result
