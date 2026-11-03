from datetime import date
from typing import Any

from fastapi import APIRouter, Body, Query

from app.deps import CurrentUser, DbDep
from app.models import PredictionLog
from app.services.inference import infer_image
from app.services.prediction import parse_prediction_date, predict_waste

router = APIRouter(prefix="/predict", tags=["prediction"])


@router.get("/")
def predict(
    db: DbDep,
    user: CurrentUser,
    target_date: date | None = Query(default=None, alias="date"),
    meal_type: str = "other",
):
    forecast_date = parse_prediction_date(target_date)
    prediction = predict_waste(db, forecast_date, meal_type)
    db.add(PredictionLog(
        user_id=user.id,
        target_date=forecast_date,
        meal_type=str(prediction["meal_type"]),
        prediction=prediction,
        model=str(prediction["model"]),
        confidence=float(prediction["confidence"]),
    ))
    db.commit()
    return prediction


@router.post("/inference")
@router.post("/infer")
def inference(_: CurrentUser, payload: dict[str, Any] = Body(default_factory=dict)):
    return infer_image(payload)
