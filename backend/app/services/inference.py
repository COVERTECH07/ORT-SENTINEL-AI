from datetime import datetime, timezone
from hashlib import sha256
from typing import Any

FOOD_ITEMS = ("Rice", "Roti", "Dal", "Sabzi", "Paneer", "Mixed meal")
MEAL_ITEMS = {
    "breakfast": ("Roti", "Dal", "Mixed meal"),
    "lunch": ("Rice", "Dal", "Sabzi", "Paneer", "Roti"),
    "dinner": ("Rice", "Roti", "Dal", "Sabzi", "Paneer"),
    "snack": ("Roti", "Mixed meal", "Paneer"),
    "other": FOOD_ITEMS,
}


def detect_food_items(image: str | None = None, meal_type: str = "other") -> list[dict[str, object]]:
    menu = MEAL_ITEMS.get(meal_type.lower(), FOOD_ITEMS)
    seed = sha256((image or meal_type or "ort-sentinel").encode("utf-8")).digest()
    first = seed[0] % len(menu)
    second = seed[1] % len(menu)
    selected = [menu[first]]
    if second != first and seed[2] % 3 == 0:
        selected.append(menu[second])
    return [
        {"name": name, "confidence": round(0.76 + seed[index + 3] / 1000, 3)}
        for index, name in enumerate(selected)
    ]


def infer_image(payload: dict[str, Any]) -> dict[str, Any]:
    image = payload.get("image") or payload.get("image_url") or payload.get("image_base64")
    items = detect_food_items(str(image) if image is not None else None, str(payload.get("meal_type", "other")))
    return {
        "food_items": items,
        "detections": [
            {
                "class": item["name"],
                "confidence": item["confidence"],
                "box": [0.18 + index * 0.08, 0.22, 0.78, 0.83],
            }
            for index, item in enumerate(items)
        ],
        "model": "deterministic-yolo-mock",
        "inference_mode": "mock",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
