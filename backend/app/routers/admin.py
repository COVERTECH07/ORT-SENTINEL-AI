import csv
import io
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.deps import CurrentUser, DbDep, require_roles
from app.models import User, WasteEntry
from app.schemas import ConfigUpdate
from app.services.configuration import get_config, update_config

router = APIRouter(prefix="/admin", tags=["administration"])


def _settings_view(cfg: dict[str, float]) -> dict[str, Any]:
    """Shape config for the Settings UI (aliases + canonical keys)."""
    return {
        **cfg,
        "threshold_grams": cfg.get("waste_threshold_grams", 100),
        "high_waste_threshold_grams": cfg.get("waste_threshold_grams", 100),
        "waste_threshold_grams": cfg.get("waste_threshold_grams", 100),
        "money_per_kg": cfg.get("money_per_kg", 50),
        "money_saved_per_kg": cfg.get("money_per_kg", 50),
        "co2_per_kg": cfg.get("co2_per_kg", 2.5),
        "co2_saved_per_kg": cfg.get("co2_per_kg", 2.5),
    }


class SettingsBody(BaseModel):
    threshold_grams: float | None = Field(default=None, gt=0)
    high_waste_threshold_grams: float | None = Field(default=None, gt=0)
    waste_threshold_grams: float | None = Field(default=None, gt=0)
    waste_threshold_kg: float | None = Field(default=None, gt=0)
    money_per_kg: float | None = Field(default=None, gt=0)
    money_saved_per_kg: float | None = Field(default=None, gt=0)
    co2_per_kg: float | None = Field(default=None, gt=0)
    co2_saved_per_kg: float | None = Field(default=None, gt=0)


def _normalize_settings(body: SettingsBody | ConfigUpdate) -> dict[str, float | None]:
    data = body.model_dump() if hasattr(body, "model_dump") else dict(body)
    return {
        "waste_threshold_grams": (
            data.get("waste_threshold_grams")
            or data.get("threshold_grams")
            or data.get("high_waste_threshold_grams")
        ),
        "waste_threshold_kg": data.get("waste_threshold_kg"),
        "money_per_kg": data.get("money_per_kg") or data.get("money_saved_per_kg"),
        "co2_per_kg": data.get("co2_per_kg") or data.get("co2_saved_per_kg"),
        "conversion_factor_kwh_per_kg": data.get("conversion_factor_kwh_per_kg"),
        "conversion_factor_co2_kg_per_kg": data.get("conversion_factor_co2_kg_per_kg"),
    }


@router.get("/config")
@router.get("/settings")
def read_config(db: DbDep, _: User = Depends(require_roles("admin", "manager"))):
    return _settings_view(get_config(db))


@router.put("/config")
@router.patch("/config")
@router.put("/settings")
@router.patch("/settings")
def write_config(
    payload: SettingsBody,
    db: DbDep,
    _: User = Depends(require_roles("admin", "manager")),
):
    return _settings_view(update_config(db, _normalize_settings(payload)))


@router.get("/export.csv")
def export_csv(db: DbDep, _: User = Depends(require_roles("admin", "manager"))):
    entries = db.scalars(select(WasteEntry).order_by(WasteEntry.created_at)).all()
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow([
        "id", "user_id", "user_name", "weight_grams", "amount_kg", "food_items",
        "meal_type", "status", "points_delta", "category", "notes", "source", "timestamp",
    ])
    for entry in entries:
        writer.writerow([
            entry.id,
            entry.user_id,
            entry.user.full_name if entry.user else "Campus",
            entry.weight_grams if entry.weight_grams is not None else entry.amount_kg * 1000,
            entry.amount_kg,
            "; ".join(item.get("name", "") for item in (entry.food_items or []) if isinstance(item, dict)),
            entry.meal_type,
            entry.status,
            entry.points_delta or 0,
            entry.category,
            entry.notes or "",
            entry.source,
            entry.created_at.isoformat(),
        ])
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="ort-waste-{datetime.now(timezone.utc).date()}.csv"'},
    )
