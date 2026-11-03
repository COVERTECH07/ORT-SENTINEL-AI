from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.deps import DbDep
from app.models import User, WasteEntry
from app.schemas import HardwareEvent
from app.services.broadcast import broadcaster
from app.services.configuration import get_config
from app.services.inference import detect_food_items
from app.services.persistence import persist_daily_stats, persist_user_badges
from app.services.scoring import record_weight, reward_event

router = APIRouter(tags=["hardware"])


@router.post("/hardware/events", status_code=202)
async def hardware_event(
    event: HardwareEvent,
    db: DbDep,
    x_hardware_key: str | None = Header(default=None),
):
    expected_key = settings.hardware_api_key
    if expected_key and x_hardware_key != expected_key:
        raise HTTPException(status_code=401, detail="Invalid hardware key")
    entry_data = None
    threshold_exceeded = False
    weight_grams = event.weight_grams
    if weight_grams is None and event.amount_kg is not None:
        weight_grams = event.amount_kg * 1000
    if weight_grams is not None:
        owner = None
        if event.rfid_uid:
            owner = db.scalar(select(User).where(User.rfid_uid == event.rfid_uid.strip()))
            if owner is None:
                raise HTTPException(status_code=404, detail="No user is mapped to this RFID UID")
        config = get_config(db)
        reward = reward_event(owner, weight_grams, config["waste_threshold_grams"]) if owner else {
            "status": "high_waste" if weight_grams > config["waste_threshold_grams"] else "low_waste",
            "points_awarded": 0,
            "points_delta": 0,
            "score_delta": 0,
            "saved_grams": max(0.0, config["waste_threshold_grams"] - weight_grams),
        }
        if owner:
            record_weight(owner, weight_grams)
        entry = WasteEntry(
            user_id=owner.id if owner else None,
            amount_kg=weight_grams / 1000,
            weight_grams=weight_grams,
            meal_type=event.meal_type.strip().lower(),
            category=event.category.strip().lower(),
            notes=f"Hardware event {event.device_id or 'unknown device'}",
            food_items=detect_food_items(event.device_id, event.meal_type),
            status=str(reward["status"]),
            points_awarded=int(reward["points_awarded"]),
            points_delta=int(reward["points_delta"]),
            score_delta=int(reward["score_delta"]),
            saved_grams=float(reward["saved_grams"]),
            source="hardware",
            created_at=event.timestamp or datetime.now(timezone.utc),
        )
        db.add(entry)
        persist_daily_stats(db, entry)
        if owner:
            persist_user_badges(db, owner)
        db.commit()
        db.refresh(entry)
        entry_data = {
            "id": entry.id,
            "amount_kg": entry.amount_kg,
            "weight_grams": entry.weight_grams,
            "meal_type": entry.meal_type,
            "category": entry.category,
            "food_items": entry.food_items,
            "status": entry.status,
            "created_at": entry.created_at.isoformat(),
        }
        payload_user = owner
        threshold_exceeded = entry.status == "high_waste"
    else:
        payload_user = None
    payload = {
        "type": f"hardware.{event.event_type}",
        "user_id": payload_user.id if payload_user else None,
        "user_name": payload_user.full_name if payload_user else "Campus",
        "device_id": event.device_id,
        "data": event.data,
        "waste": entry_data,
        "threshold_exceeded": threshold_exceeded,
        "weight_grams": weight_grams,
        "timestamp": (event.timestamp or datetime.now(timezone.utc)).isoformat(),
    }
    if entry_data:
        payload["food_items"] = entry_data["food_items"]
        payload["meal_type"] = entry_data["meal_type"]
        payload["status"] = entry_data["status"]
        payload["points_delta"] = entry.points_delta
        payload["score"] = payload_user.waste_score if payload_user else None
        payload["total_points"] = payload_user.total_points if payload_user else None
    await broadcaster.publish(payload)
    return {"accepted": True, "event": payload}
