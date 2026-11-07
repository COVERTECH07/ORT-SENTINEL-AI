"""Demand forecasting: XGBoost (meal-level) + Prophet (daily) with hybrid ensemble.

Falls back to historical averages when ML packages or data volume are insufficient.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import User, WasteEntry

logger = logging.getLogger(__name__)

MEAL_PORTIONS_KG = {
    "breakfast": {"Roti": 0.12, "Dal": 0.10, "Mixed meal": 0.08, "Salad": 0.06},
    "lunch": {"Rice": 0.18, "Roti": 0.08, "Dal": 0.10, "Sabzi": 0.12, "Paneer": 0.07, "Salad": 0.05},
    "dinner": {"Rice": 0.16, "Roti": 0.10, "Dal": 0.10, "Sabzi": 0.12, "Paneer": 0.07},
    "snack": {"Mixed meal": 0.09, "Roti": 0.08, "Paneer": 0.05, "Dessert": 0.04},
    "other": {"Rice": 0.15, "Roti": 0.10, "Dal": 0.10, "Sabzi": 0.10, "Mixed meal": 0.08},
}
MEAL_TYPES = tuple(MEAL_PORTIONS_KG)


def _xgboost_waste(db: Session, target_date: date, meal_type: str) -> float | None:
    """Per-diner waste kg predicted by XGBoost from weekday/month/meal features."""
    try:
        import xgboost as xgb

        rows = db.scalars(select(WasteEntry).order_by(WasteEntry.created_at.desc()).limit(800)).all()
        if len(rows) < 12:
            return None
        meal_index = {meal: index for index, meal in enumerate(MEAL_TYPES)}
        features = [
            [
                row.created_at.weekday(),
                row.created_at.month,
                meal_index.get(row.meal_type, 4),
                1 if row.created_at.weekday() >= 5 else 0,
            ]
            for row in rows
        ]
        targets = [
            (row.weight_grams / 1000 if row.weight_grams is not None else row.amount_kg)
            for row in rows
        ]
        model = xgb.XGBRegressor(
            n_estimators=80,
            max_depth=4,
            learning_rate=0.07,
            subsample=0.9,
            colsample_bytree=0.9,
            n_jobs=1,
            verbosity=0,
        )
        model.fit(features, targets)
        pred = float(
            model.predict(
                [[
                    target_date.weekday(),
                    target_date.month,
                    meal_index.get(meal_type, 4),
                    1 if target_date.weekday() >= 5 else 0,
                ]]
            )[0]
        )
        return max(0.0, pred)
    except ImportError:
        logger.info("xgboost not installed — skip XGBoost branch")
        return None
    except Exception:
        logger.exception("XGBoost prediction failed")
        return None


def _prophet_daily_waste(db: Session, target_date: date) -> float | None:
    """Campus-wide daily waste kg from Prophet weekly seasonality."""
    try:
        import pandas as pd
        from prophet import Prophet

        rows = db.execute(
            select(func.date(WasteEntry.created_at), func.sum(WasteEntry.amount_kg))
            .group_by(func.date(WasteEntry.created_at))
            .order_by(func.date(WasteEntry.created_at))
        ).all()
        if len(rows) < 14:
            return None
        frame = pd.DataFrame([{"ds": row[0], "y": float(row[1])} for row in rows])
        frame["ds"] = pd.to_datetime(frame["ds"])
        model = Prophet(
            daily_seasonality=False,
            weekly_seasonality=True,
            yearly_seasonality=False,
            changepoint_prior_scale=0.05,
        )
        model.fit(frame)
        forecast = model.predict(pd.DataFrame({"ds": [pd.Timestamp(target_date)]}))
        return max(0.0, float(forecast.iloc[0]["yhat"]))
    except ImportError:
        logger.info("prophet not installed — skip Prophet branch")
        return None
    except Exception:
        logger.exception("Prophet prediction failed")
        return None


def _expected_diners(db: Session, meal_type: str) -> int:
    start = datetime.now(timezone.utc) - timedelta(days=14)
    rows = db.execute(
        select(func.date(WasteEntry.created_at), func.count(func.distinct(WasteEntry.user_id)))
        .where(
            WasteEntry.created_at >= start,
            WasteEntry.meal_type == meal_type,
            WasteEntry.user_id.is_not(None),
        )
        .group_by(func.date(WasteEntry.created_at))
    ).all()
    if rows:
        return max(1, round(sum(int(row[1]) for row in rows) / len(rows)))
    students = int(
        db.scalar(select(func.count(User.id)).where(User.role == "student", User.is_active.is_(True))) or 0
    )
    return max(1, students or 100)


def _recent_waste_per_diner(db: Session, meal_type: str) -> float:
    start = datetime.now(timezone.utc) - timedelta(days=14)
    entries = db.scalars(
        select(WasteEntry).where(
            WasteEntry.created_at >= start,
            WasteEntry.meal_type == meal_type,
        )
    ).all()
    if not entries:
        return 0.05  # soft default kg/diner for empty DB demos
    daily: dict[str, float] = defaultdict(float)
    for entry in entries:
        grams = entry.weight_grams if entry.weight_grams is not None else entry.amount_kg * 1000
        daily[entry.created_at.date().isoformat()] += grams / 1000
    return sum(daily.values()) / len(daily)


def predict_waste(db: Session, target_date: date, meal_type: str) -> dict[str, object]:
    meal_type = meal_type.strip().lower()
    if meal_type not in MEAL_PORTIONS_KG:
        meal_type = "other"

    diners = _expected_diners(db, meal_type)
    historical_waste_kg = _recent_waste_per_diner(db, meal_type)
    xgb_per_diner = _xgboost_waste(db, target_date, meal_type)
    prophet_total = _prophet_daily_waste(db, target_date)

    branches: list[str] = []
    predicted_waste_kg: float
    confidence: float

    if xgb_per_diner is not None and prophet_total is not None:
        # Hybrid: blend meal-level XGBoost with scaled Prophet daily signal
        xgb_total = xgb_per_diner * diners
        prophet_meal = prophet_total / max(1, len(MEAL_PORTIONS_KG))
        predicted_waste_kg = 0.6 * xgb_total + 0.4 * prophet_meal
        branches = ["xgboost", "prophet"]
        model_name = "hybrid xgboost + prophet"
        confidence = 0.88
    elif xgb_per_diner is not None:
        predicted_waste_kg = xgb_per_diner * diners
        branches = ["xgboost"]
        model_name = "xgboost + itemized demand"
        confidence = 0.84
    elif prophet_total is not None:
        predicted_waste_kg = prophet_total / max(1, len(MEAL_PORTIONS_KG))
        branches = ["prophet"]
        model_name = "prophet + itemized demand"
        confidence = 0.80
    else:
        predicted_waste_kg = historical_waste_kg * max(1, diners / 20)
        branches = ["historical"]
        model_name = "deterministic historical demand"
        confidence = 0.72 if historical_waste_kg > 0 else 0.55

    expected_total_kg = sum(MEAL_PORTIONS_KG[meal_type].values()) * diners
    observed_waste_ratio = min(0.20, predicted_waste_kg / expected_total_kg) if expected_total_kg else 0
    reduction_percent = round(min(15.0, max(3.0, observed_waste_ratio * 100)), 1)
    recommended_factor = 1 - reduction_percent / 100
    items = [
        {
            "food_item": name,
            "name": name,
            "expected_demand_kg": round(portion * diners, 3),
            "predicted_quantity_kg": round(portion * diners, 3),
            "recommended_quantity_kg": round(portion * diners * recommended_factor, 3),
            "kg": round(portion * diners * recommended_factor, 3),
            "weight_kg": round(portion * diners * recommended_factor, 3),
            "confidence": confidence,
        }
        for name, portion in MEAL_PORTIONS_KG[meal_type].items()
    ]
    recommended_total = round(sum(float(item["recommended_quantity_kg"]) for item in items), 3)
    return {
        "date": target_date.isoformat(),
        "meal_type": meal_type,
        "items": items,
        "predictions": items,
        "recommendations": items,
        "expected_diners": diners,
        "predicted_waste_kg": round(predicted_waste_kg, 3),
        "total_kg": round(predicted_waste_kg, 3),
        "expected_demand_kg": round(expected_total_kg, 3),
        "recommended_total_kg": recommended_total,
        "waste_reduction_percent": reduction_percent,
        "model": model_name,
        "models_used": branches,
        "confidence": confidence,
        "ml_ready": {
            "xgboost": "xgboost" in branches or xgb_per_diner is not None,
            "prophet": "prophet" in branches or prophet_total is not None,
        },
    }


def parse_prediction_date(value: date | None) -> date:
    return value or datetime.now(timezone.utc).date() + timedelta(days=1)
