import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select

from app.deps import CurrentUser, DbDep, require_roles
from app.models import User, WasteEntry
from app.schemas import ConfigUpdate
from app.services.configuration import get_config, update_config

router = APIRouter(prefix="/admin", tags=["administration"])


@router.get("/config")
def read_config(db: DbDep, _: User = Depends(require_roles("admin", "manager"))):
    return get_config(db)


@router.put("/config")
@router.patch("/config")
def write_config(
    payload: ConfigUpdate,
    db: DbDep,
    _: User = Depends(require_roles("admin", "manager")),
):
    return update_config(db, payload.model_dump())


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
