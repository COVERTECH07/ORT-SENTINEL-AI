import logging
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect, make_url, text
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)
BACKEND_DIR = Path(__file__).resolve().parents[1]


class Base(DeclarativeBase):
    pass


def _create_engine(url: str):
    database_url = make_url(url)
    options = {"pool_pre_ping": True}
    if database_url.drivername.startswith("sqlite"):
        options["connect_args"] = {"check_same_thread": False}
        database = database_url.database
        is_memory_database = database in {None, "", ":memory:"} or database_url.query.get("mode") == "memory"
        is_uri_database = database_url.query.get("uri") and str(database).startswith("file:")
        if database and not is_memory_database and not is_uri_database and not Path(database).is_absolute():
            resolved_path = (BACKEND_DIR / database).resolve()
            database_url = database_url.set(database=resolved_path.as_posix())
        if is_memory_database:
            options["poolclass"] = StaticPool
    elif database_url.drivername.startswith("postgresql"):
        options["connect_args"] = {"connect_timeout": settings.database_connect_timeout_seconds}
    return create_engine(database_url, **options)


try:
    engine = _create_engine(settings.database_url)
    with engine.connect():
        pass
except Exception:
    if settings.database_url.startswith("sqlite"):
        raise
    logger.exception(
        "Primary database is unavailable; using the local SQLite fallback at %s",
        (BACKEND_DIR / "ort_sentinel_fallback.db").resolve(),
    )
    engine = _create_engine("sqlite:///./ort_sentinel_fallback.db")

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def initialize_database() -> None:
    from app.models import Base

    Base.metadata.create_all(bind=engine)
    additions = {
        "users": {
            "rfid_uid": "VARCHAR(120)",
            "waste_score": "INTEGER",
            "total_points": "INTEGER",
            "total_waste_grams": "FLOAT",
            "low_waste_events": "INTEGER",
            "high_waste_events": "INTEGER",
            "current_low_streak": "INTEGER",
            "badges": "JSON",
        },
        "waste_entries": {
            "weight_grams": "FLOAT",
            "food_items": "JSON",
            "image_url": "TEXT",
            "image_data": "TEXT",
            "status": "VARCHAR(30)",
            "points_awarded": "INTEGER",
            "points_delta": "INTEGER",
            "score_delta": "INTEGER",
            "saved_grams": "FLOAT",
        },
    }
    with engine.begin() as connection:
        for table, columns in additions.items():
            existing = {column["name"] for column in inspect(connection).get_columns(table)}
            for name, column_type in columns.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {column_type}"))
        connection.execute(text("UPDATE users SET role = 'student' WHERE role = 'user'"))
        connection.execute(text("UPDATE users SET role = 'manager' WHERE role = 'staff'"))
        connection.execute(text(
            "UPDATE users SET waste_score = COALESCE(waste_score, 1000), "
            "total_points = COALESCE(total_points, 0), "
            "total_waste_grams = COALESCE(total_waste_grams, 0), "
            "low_waste_events = COALESCE(low_waste_events, 0), "
            "high_waste_events = COALESCE(high_waste_events, 0), "
            "current_low_streak = COALESCE(current_low_streak, 0), "
            "badges = COALESCE(badges, '[]')"
        ))
        connection.execute(text(
            "UPDATE waste_entries SET "
            "weight_grams = COALESCE(weight_grams, amount_kg * 1000), "
            "food_items = COALESCE(food_items, '[]'), "
            "points_awarded = COALESCE(points_awarded, 0), "
            "points_delta = COALESCE(points_delta, 0), "
            "score_delta = COALESCE(score_delta, 0), "
            "saved_grams = COALESCE(saved_grams, 0)"
        ))
        threshold_value = connection.execute(text(
            "SELECT value FROM app_config WHERE key = 'waste_threshold_grams'"
        )).scalar()
        if threshold_value is None:
            legacy_threshold = connection.execute(text(
                "SELECT value FROM app_config WHERE key = 'waste_threshold_kg'"
            )).scalar()
            threshold_grams = float(legacy_threshold) * 1000 if legacy_threshold is not None else settings.waste_threshold_grams
        else:
            threshold_grams = float(threshold_value)
        connection.execute(text(
            "UPDATE waste_entries SET "
            "status = CASE WHEN weight_grams > :threshold THEN 'high_waste' ELSE 'low_waste' END, "
            "saved_grams = CASE WHEN weight_grams < :threshold "
            "THEN :threshold - weight_grams ELSE 0 END "
            "WHERE status IS NULL"
        ), {"threshold": threshold_grams})
        connection.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_rfid_uid ON users (rfid_uid)"
        ))


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
