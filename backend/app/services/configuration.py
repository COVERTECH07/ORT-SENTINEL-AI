from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AppConfig

DEFAULTS = {
    "waste_threshold_grams": settings.waste_threshold_grams,
    "money_per_kg": settings.money_per_kg,
    "co2_per_kg": settings.co2_per_kg,
    "conversion_factor_kwh_per_kg": settings.default_conversion_factor_kwh_per_kg,
    "conversion_factor_co2_kg_per_kg": settings.default_conversion_factor_co2_kg_per_kg,
}


def _with_legacy_keys(values: dict[str, float]) -> dict[str, float]:
    return {
        **values,
        "waste_threshold_kg": values["waste_threshold_grams"] / 1000,
        "conversion_factor_co2_kg_per_kg": values["co2_per_kg"],
    }


def get_config(db: Session) -> dict[str, float]:
    values = DEFAULTS.copy()
    stored_keys: set[str] = set()
    for row in db.query(AppConfig).all():
        stored_keys.add(row.key)
        try:
            values[row.key] = float(row.value)
        except (ValueError, TypeError):
            continue
    legacy_threshold = values.get("waste_threshold_kg")
    if "waste_threshold_grams" not in stored_keys and legacy_threshold is not None:
        values["waste_threshold_grams"] = legacy_threshold * 1000
    legacy_co2 = values.get("conversion_factor_co2_kg_per_kg")
    if "co2_per_kg" not in stored_keys and legacy_co2 is not None:
        values["co2_per_kg"] = legacy_co2
    return _with_legacy_keys(values)


def update_config(db: Session, updates: dict[str, float | None]) -> dict[str, float]:
    normalized = updates.copy()
    if normalized.get("waste_threshold_grams") is None and normalized.get("waste_threshold_kg") is not None:
        normalized["waste_threshold_grams"] = normalized["waste_threshold_kg"] * 1000
    if normalized.get("co2_per_kg") is None and normalized.get("conversion_factor_co2_kg_per_kg") is not None:
        normalized["co2_per_kg"] = normalized["conversion_factor_co2_kg_per_kg"]
    for key, value in normalized.items():
        if value is None or key not in DEFAULTS:
            continue
        row = db.get(AppConfig, key)
        if row is None:
            row = AppConfig(key=key, value=str(value))
            db.add(row)
        else:
            row.value = str(value)
    db.commit()
    return get_config(db)
