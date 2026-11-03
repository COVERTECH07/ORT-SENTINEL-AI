from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), default="")
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(30), default="student", nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rfid_uid: Mapped[str | None] = mapped_column(String(120), nullable=True)
    waste_score: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)
    total_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_waste_grams: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    low_waste_events: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    high_waste_events: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_low_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    badges: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    waste_entries: Mapped[list["WasteEntry"]] = relationship(back_populates="user")


class WasteEntry(Base):
    __tablename__ = "waste_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    amount_kg: Mapped[float] = mapped_column(Float, nullable=False)
    weight_grams: Mapped[float | None] = mapped_column(Float, nullable=True)
    meal_type: Mapped[str] = mapped_column(String(40), default="other", index=True)
    category: Mapped[str] = mapped_column(String(80), default="general", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    food_items: Mapped[list[dict[str, object]] | None] = mapped_column(JSON, default=list, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="low_waste", nullable=False, index=True)
    points_awarded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    points_delta: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    score_delta: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    saved_grams: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    source: Mapped[str] = mapped_column(String(30), default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    user: Mapped[User | None] = relationship(back_populates="waste_entries")


class AppConfig(Base):
    __tablename__ = "app_config"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Badge(Base):
    __tablename__ = "badges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")


class UserBadge(Base):
    __tablename__ = "user_badges"
    __table_args__ = (UniqueConstraint("user_id", "badge_id", name="uq_user_badge"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    badge_id: Mapped[int] = mapped_column(ForeignKey("badges.id", ondelete="CASCADE"), index=True)
    awarded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DailyStats(Base):
    __tablename__ = "daily_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stat_date: Mapped[date] = mapped_column(Date, unique=True, nullable=False, index=True)
    total_waste_grams: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    saved_grams: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    event_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    high_waste_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    low_waste_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class PredictionLog(Base):
    __tablename__ = "prediction_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    target_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    meal_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    prediction: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
