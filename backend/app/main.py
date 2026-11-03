import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.core.config import settings
from app.db import SessionLocal, initialize_database
from app.models import WasteEntry
from app.models import User
from app.routers import admin, auth, dashboard, hardware, live, predict, users, waste
from app.services.broadcast import broadcaster
from app.services.configuration import get_config
from app.services.inference import detect_food_items
from app.services.persistence import persist_daily_stats, persist_user_badges
from app.services.scoring import record_weight, reward_event

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


def _mqtt_setup(loop: asyncio.AbstractEventLoop):
    if not settings.mqtt_host:
        return None
    try:
        import paho.mqtt.client as mqtt

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)

        def on_connect(client, userdata, flags, reason_code, properties):
            if reason_code == 0:
                client.subscribe(settings.mqtt_topic)
                logger.info("Subscribed to MQTT topic %s", settings.mqtt_topic)
            else:
                logger.error("MQTT connection failed with code %s", reason_code)

        def on_message(client, userdata, message):
            db = None
            try:
                event: dict[str, Any] = json.loads(message.payload.decode("utf-8"))
                event.setdefault("type", "hardware.mqtt")
                event.setdefault("topic", message.topic)
                grams = event.get("weight_grams")
                if grams is None and event.get("amount_kg") is not None:
                    grams = float(event["amount_kg"]) * 1000
                if grams is not None and float(grams) > 0:
                    db = SessionLocal()
                    stamp = event.get("timestamp")
                    created_at = datetime.fromisoformat(stamp) if isinstance(stamp, str) else datetime.now(timezone.utc)
                    user = None
                    if event.get("rfid_uid"):
                        user = db.scalar(select(User).where(User.rfid_uid == str(event["rfid_uid"])))
                    grams = float(grams)
                    config = get_config(db)
                    reward = reward_event(user, grams, config["waste_threshold_grams"]) if user else {
                        "status": "high_waste" if grams > config["waste_threshold_grams"] else "low_waste",
                        "points_awarded": 0,
                        "points_delta": 0,
                        "score_delta": 0,
                        "saved_grams": max(0.0, config["waste_threshold_grams"] - grams),
                    }
                    if user:
                        record_weight(user, grams)
                    meal_type = str(event.get("meal_type", "other")).lower()
                    food_items = detect_food_items(str(event.get("image", "")) or None, meal_type)
                    entry = WasteEntry(
                        user_id=user.id if user else None,
                        amount_kg=grams / 1000,
                        weight_grams=grams,
                        meal_type=meal_type,
                        category=str(event.get("category", "general")).lower(),
                        notes=f"MQTT device {event.get('device_id', 'unknown')}",
                        food_items=food_items,
                        status=str(reward["status"]),
                        points_awarded=int(reward["points_awarded"]),
                        points_delta=int(reward["points_delta"]),
                        score_delta=int(reward["score_delta"]),
                        saved_grams=float(reward["saved_grams"]),
                        source="mqtt",
                        created_at=created_at,
                    )
                    db.add(entry)
                    persist_daily_stats(db, entry)
                    if user:
                        persist_user_badges(db, user)
                    db.commit()
                    event["waste"] = {
                        "id": entry.id,
                        "weight_grams": grams,
                        "food_items": food_items,
                        "status": entry.status,
                        "created_at": entry.created_at.isoformat(),
                    }
                    event["user_id"] = user.id if user else None
                    event["user_name"] = user.full_name if user else "Campus"
                    event["weight_grams"] = grams
                    event["meal_type"] = meal_type
                    event["food_items"] = food_items
                    event["status"] = entry.status
                    event["points_delta"] = entry.points_delta
                    event["threshold_exceeded"] = entry.status == "high_waste"
                    event["score"] = user.waste_score if user else None
                    event["total_points"] = user.total_points if user else None
                asyncio.run_coroutine_threadsafe(broadcaster.publish(event), loop)
            except Exception:
                if db:
                    db.rollback()
                logger.exception("Could not process MQTT event")
            finally:
                if db:
                    db.close()

        client.on_connect = on_connect
        client.on_message = on_message
        client.connect(settings.mqtt_host, settings.mqtt_port, keepalive=60)
        client.loop_start()
        return client
    except Exception:
        logger.exception("MQTT client could not start")
        return None


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    if settings.seed_demo_data:
        from seed import seed

        seed()
    await broadcaster.start()
    loop = asyncio.get_running_loop()
    mqtt_client = _mqtt_setup(loop)
    yield
    if mqtt_client:
        mqtt_client.loop_stop()
        mqtt_client.disconnect()
    await broadcaster.stop()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="ORT SENTINEL AI waste monitoring and prediction API",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled request error: %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
def health():
    return {"status": "ok", "service": settings.app_name}


for route in (auth.router, users.router, waste.router, dashboard.router, predict.router, admin.router, hardware.router):
    app.include_router(route, prefix=settings.api_prefix)
app.include_router(live.router, prefix=settings.api_prefix)
