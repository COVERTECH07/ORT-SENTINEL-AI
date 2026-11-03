# ORT SENTINEL AI backend

FastAPI and SQLAlchemy backend for campus waste events, student rewards, dashboard metrics, demand recommendations, RFID/hardware events, and live updates. Python 3.11+.

## Run locally

```powershell
Set-Location 'C:\Users\Tashu Bajpai\OneDrive\Desktop\ORT AI'
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
Set-Location .\backend
if (-not (Test-Path .\.venv\Scripts\python.exe)) { python -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:DATABASE_URL = "sqlite:///./ort_sentinel_fallback.db"
$env:JWT_SECRET_KEY = "local-development-only-change-this-secret"
& .\.venv\Scripts\python.exe seed.py
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Local runs use SQLite at `backend/ort_sentinel_fallback.db`, preserving the existing local database by default. The project-root `.env` is loaded even when the working directory is `backend`. Docker Compose explicitly sets `DATABASE_URL` to PostgreSQL; PostgreSQL remains supported for deployments. Its connection attempt is capped at five seconds before the existing SQLite fallback is used. The schema initializer adds product-contract columns without dropping older `amount_kg` records. OpenAPI is available at `/docs`.

The idempotent demo seeder creates:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@ort.edu` | `Admin123!` |
| Manager | `manager@ort.edu` | `Manager123!` |
| Student | `student1@ort.edu` | `Student123!` |
| Students 2–3 | `student2@ort.edu`, `student3@ort.edu` | `Student123!` |

It adds RFID demo mappings and 14 days of realistic breakfast, lunch, and dinner waste events. These credentials are for local demonstrations only; set `SEED_DEMO_DATA=false` and rotate secrets/passwords before deployment.
The schema includes `Badge`/`UserBadge`, `DailyStats`, and `PredictionLog` alongside users and waste events. Event ingestion maintains daily summaries and badge awards, and prediction requests are logged. Install `requirements-ml.txt` for optional Ultralytics/XGBoost/Prophet integration packages; the mock detector and itemized deterministic forecast work without model weights.

## Compose environment

Settings read the names used in the root Compose file and `.env.example`:

| Variable | Meaning | Default |
|---|---|---|
| `DATABASE_URL` | SQLAlchemy PostgreSQL or SQLite URL | Compose PostgreSQL |
| `JWT_SECRET_KEY` | JWT signing secret (`SECRET_KEY` is also accepted) | Development-only placeholder |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Access lifetime | `30` |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | Refresh lifetime | `14` |
| `WASTE_THRESHOLD_GRAMS` | High-waste cutoff; events above it are high | `100` |
| `MONEY_PER_KG` | Estimated rupees per kilogram of low-waste margin | `50` |
| `CO2_PER_KG` | Estimated CO₂ kg per kilogram of low-waste margin | `2.5` |
| `CORS_ORIGINS` | Comma-separated allowed origins | localhost origins |
| `SEED_DEMO_DATA` | Seed demo accounts/data on startup | `false` |
| `REDIS_URL` | Optional cross-worker WebSocket pub/sub | Disabled |
| `MQTT_BROKER`, `MQTT_PORT`, `MQTT_TOPIC` | Optional MQTT ingestion | Disabled |
| `HARDWARE_API_KEY` | Optional `X-Hardware-Key` for HTTP device events | Disabled |

No Compose variable rename is required. Legacy names (`SECRET_KEY`, `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS`, `MQTT_HOST`) are accepted for compatibility.

## Product API contract

REST endpoints are prefixed with `/api`.

- `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`; `GET /auth/me`. Registration always creates a `student`; role selection is admin-managed. Login accepts JSON `{ "email": "...", "password": "..." }` or OAuth form fields (`username`, `password`). Token responses contain `access_token`, `refresh_token`, `token_type`, and serialized `user`. User serialization includes `name`, `role`, `waste_score`, `total_points`, `total_waste_grams`, and `badges`.
- `GET /users/` is available to admin and manager. Only admins can change roles or activation; managers can manage names/RFID assignment. Students can only view their own profile.
- `POST /waste/` accepts `{ "weight_grams": 45, "meal_type": "lunch", "timestamp": "...", "image": "...", "user_id": 3 }`; `rfid_uid` can be used instead of `user_id`. Students are always restricted to their own identity, managers/admins can attribute to a mapped campus user. Legacy `{ "amount_kg": 0.045 }` and `quantity` inputs remain accepted.
- `GET /waste/` accepts `user_id`, `meal_type`, `status`, `start_date`, `end_date`, `limit`, and `offset`. Students always receive only their own rows; managers/admins can query campus-wide records.
- `POST /predict/inference` and `/predict/infer` return deterministic Indian-food classes (`Rice`, `Roti`, `Dal`, `Sabzi`, `Paneer`, `Mixed meal`) with confidence scores. No model weights are downloaded; this is a deterministic mock detector.
- `GET /predict/?date=YYYY-MM-DD&meal_type=lunch` returns `items`, `predictions`, and `recommendations` arrays. Each item includes `food_item`, `expected_demand_kg`, `predicted_quantity_kg`, `recommended_quantity_kg`, and numeric `confidence` (0–1). Response-level `expected_diners`, `waste_reduction_percent`, `model`, and confidence support the dashboard. The deterministic itemized fallback is always available; optional XGBoost/Prophet packages are listed in `requirements-ml.txt`.
- `GET /dashboard/stats` returns `total_waste_kg`/`all_time_waste_kg`, `filtered_waste_kg`, `waste_saved_kg`, `money_saved`/`money_saved_inr`, `co2_saved_kg`, `waste_change_percent`, `event_count`, and student `waste_score`, `total_points`, `rank`, `badges`. `start_date`, `end_date`, `meal_type`, and `user_id` filters are supported; user filters are ignored for students to preserve ownership.
- `GET /dashboard/charts?days=7` returns `daily_trend` rows `{date,waste_kg,saved_kg}`, `item_waste` rows `{food_item,weight_kg}`, and `meal_distribution` rows `{meal_type,weight_kg}`. It accepts the same date, meal, and user filters. Compatible aliases `daily`, `items`, `categories`, and `meals` are also returned.
- `GET /dashboard/leaderboard` returns ranked student records with `name`, `role`, `waste_score`, and `total_points`.
- `GET|PUT /admin/config`, `GET /admin/export.csv`; `POST /hardware/events`; authenticated `WS /ws/live?token=<access_token>`.

### Rewards and estimates

Waste events store grams, food-item detections, meal, timestamp, status, user display name, saved-gram estimate, and score/point deltas. Scores start at 1,000. Events above the configured threshold are `high_waste`: they apply a 10-point penalty, reset the current low-waste streak, and remove the active streak badge. Events at or under the threshold earn up to 20 points based on how far below the cutoff the weight is, and unlock cumulative low-waste milestone badges. Campus `waste_saved_kg` is the current-month estimate: the sum of `threshold_grams - event_weight_grams` for low-waste events, not independently measured prevented waste. Money and CO₂ are derived from that estimate and the configured factors. Students see their own stats and waste rows; managers/admins see campus aggregates and feed records.
