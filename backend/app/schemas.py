from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=150)
    name: str | None = None

    @model_validator(mode="after")
    def choose_name(self):
        if self.name and not self.full_name:
            self.full_name = self.name
        return self


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=150)
    role: Literal["student", "manager", "admin"] | None = None
    is_active: bool | None = None
    rfid_uid: str | None = Field(default=None, max_length=120)


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    name: str
    role: str
    is_active: bool
    created_at: datetime
    waste_score: int = 0
    total_points: int = 0
    total_waste_grams: float = 0
    badges: list[str] = Field(default_factory=list)
    rfid_uid: str | None = None

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_user(cls, user: Any) -> "UserOut":
        return cls(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            name=user.full_name,
            role=user.role,
            is_active=user.is_active,
            created_at=user.created_at,
            waste_score=user.waste_score or 0,
            total_points=user.total_points or 0,
            total_waste_grams=user.total_waste_grams or 0,
            badges=user.badges or [],
            rfid_uid=user.rfid_uid,
        )


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str


class WasteCreate(BaseModel):
    amount_kg: float | None = Field(default=None, gt=0, le=100000)
    quantity: float | None = Field(default=None, gt=0, le=100000)
    weight_grams: float | None = Field(default=None, gt=0, le=100000000)
    user_id: int | None = Field(default=None, gt=0)
    rfid_uid: str | None = Field(default=None, max_length=120)
    meal_type: str = Field(default="other", max_length=40)
    category: str = Field(default="general", max_length=80)
    notes: str | None = Field(default=None, max_length=2000)
    date: datetime | None = None
    timestamp: datetime | None = None
    image: str | None = Field(default=None, max_length=5_000_000)
    image_base64: str | None = Field(default=None, max_length=5_000_000)
    image_url: str | None = Field(default=None, max_length=2048)

    @model_validator(mode="after")
    def set_amount(self):
        if self.weight_grams is None and self.amount_kg is None and self.quantity is None:
            raise ValueError("weight_grams or amount_kg is required")
        if self.weight_grams is None:
            self.weight_grams = (self.amount_kg if self.amount_kg is not None else self.quantity) * 1000
        if self.amount_kg is None:
            self.amount_kg = self.weight_grams / 1000
        return self


class WasteOut(BaseModel):
    id: int
    user_id: int | None
    amount_kg: float
    quantity: float
    meal_type: str
    category: str
    notes: str | None
    source: str
    created_at: datetime
    timestamp: datetime
    weight_grams: float
    food_items: list[dict[str, object]]
    image_url: str | None
    status: str
    points_awarded: int
    points_delta: int
    score_delta: int
    saved_grams: float
    user_name: str | None

    @classmethod
    def from_entry(cls, entry: Any) -> "WasteOut":
        return cls(
            id=entry.id,
            user_id=entry.user_id,
            amount_kg=entry.amount_kg,
            quantity=entry.amount_kg,
            meal_type=entry.meal_type,
            category=entry.category,
            notes=entry.notes,
            source=entry.source,
            created_at=entry.created_at,
            timestamp=entry.created_at,
            weight_grams=entry.weight_grams if entry.weight_grams is not None else entry.amount_kg * 1000,
            food_items=entry.food_items or [],
            image_url=entry.image_url,
            status=entry.status or "low_waste",
            points_awarded=entry.points_awarded or 0,
            points_delta=entry.points_delta or 0,
            score_delta=entry.score_delta or 0,
            saved_grams=entry.saved_grams or 0,
            user_name=entry.user.full_name if entry.user else "Campus",
        )


class ConfigUpdate(BaseModel):
    waste_threshold_grams: float | None = Field(default=None, gt=0)
    waste_threshold_kg: float | None = Field(default=None, gt=0)
    money_per_kg: float | None = Field(default=None, gt=0)
    co2_per_kg: float | None = Field(default=None, gt=0)
    conversion_factor_kwh_per_kg: float | None = Field(default=None, gt=0)
    conversion_factor_co2_kg_per_kg: float | None = Field(default=None, gt=0)


class HardwareEvent(BaseModel):
    event_type: str = Field(default="measurement", max_length=80)
    amount_kg: float | None = Field(default=None, gt=0, le=100000)
    weight_grams: float | None = Field(default=None, gt=0, le=100000000)
    rfid_uid: str | None = Field(default=None, max_length=120)
    meal_type: str = Field(default="other", max_length=40)
    category: str = Field(default="general", max_length=80)
    device_id: str | None = Field(default=None, max_length=100)
    timestamp: datetime | None = None
    data: dict[str, Any] = Field(default_factory=dict)
