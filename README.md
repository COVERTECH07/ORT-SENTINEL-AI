# ORT SENTINEL AI

An intelligent resource-wastage analyser for campus canteens and hostels. ORT Sentinel tracks disposal events, classifies food, gives immediate feedback, rewards low-waste choices, visualizes campus impact, and forecasts cooking demand.

## What’s included

- **FastAPI backend** with JWT access/refresh tokens, role-based access, SQLAlchemy, PostgreSQL and SQLite support, generated API docs, CSV export, and configurable sustainability factors.
- **React + TypeScript frontend** with a responsive manager dashboard, student impact portal, real-time feed, demand predictions, and admin settings.
- **Live updates** over authenticated WebSockets and an optional Redis cache/pub-sub integration.
- **Food detection** via an inference-ready YOLO interface with a realistic mock detector for local use without model weights.
- **Demand forecasting** with optional Prophet/XGBoost models and working seeded-data fallbacks.
- **Hardware-ready interfaces** for MQTT and smart-bin waste events.
- **Demo data** covering multiple campus users, meals, food types, and two weeks of waste activity.

## Run with Docker Compose

Requirements: Docker Desktop / Docker Engine with Compose.

```powershell
Copy-Item .env.example .env
# Set POSTGRES_PASSWORD and JWT_SECRET_KEY in .env to strong, unique values.
docker compose up --build
```

Open the frontend at [http://localhost:8080](http://localhost:8080), the API at [http://localhost:8000](http://localhost:8000), and interactive API docs at [http://localhost:8000/docs](http://localhost:8000/docs).

The backend initializes the schema and seeds demo data on startup when `SEED_DEMO_DATA=true`. The demo login credentials are `admin@ort.edu` / `Admin123!`, `manager@ort.edu` / `Manager123!`, and `student1@ort.edu` / `Student123!`. Change these for any non-demo deployment.

## Local development

### Backend

Python 3.11+ is recommended. Local development defaults to SQLite and reuses `backend/ort_sentinel_fallback.db`; PostgreSQL remains the Compose/deployment database. The root `.env` is loaded regardless of the backend command's working directory. Redis is optional.

```powershell
Set-Location 'C:\Users\Tashu Bajpai\OneDrive\Desktop\ORT AI'
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
Set-Location .\backend
if (-not (Test-Path .\.venv\Scripts\python.exe)) { python -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:DATABASE_URL = "sqlite:///./ort_sentinel_fallback.db"
$env:JWT_SECRET_KEY = "local-development-only-change-this-secret"
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

In another terminal:

```powershell
Set-Location 'C:\Users\Tashu Bajpai\OneDrive\Desktop\ORT AI\frontend'
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Vite proxies `/api` (including WebSocket connections) to `http://127.0.0.1:8000`, matching the backend bind address and avoiding IPv6 `localhost` resolution issues. Set `VITE_API_URL` only when your API is hosted at a different origin.

## Configuration

Copy `.env.example` to `.env`. The compose stack passes these settings to the backend:

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | SQLAlchemy URL; PostgreSQL in Compose, SQLite is supported locally | Compose PostgreSQL |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | PostgreSQL credentials | `ort_sentinel`, `ort`, local-only password |
| `JWT_SECRET_KEY` | Signing key for access and refresh tokens | Set a strong secret |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime | `30` |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime | `14` |
| `WASTE_THRESHOLD_GRAMS` | High-waste alert threshold | `100` |
| `MONEY_PER_KG` | Estimated rupees saved per kilogram | `50` |
| `CO2_PER_KG` | Estimated CO₂ kilograms avoided per kilogram saved | `2.5` |
| `CORS_ORIGINS` | Comma-separated allowed browser origins | Local Vite and Compose URLs |
| `SEED_DEMO_DATA` | Seed representative users and two weeks of events | `true` |
| `REDIS_URL` | Optional cache / cross-worker event pub-sub | Compose Redis |
| `MQTT_BROKER`, `MQTT_PORT`, `MQTT_TOPIC` | Optional hardware broker and waste topic | Disabled |

Never use demo credentials, example secrets, or the Compose fallback password in a public deployment. Configure TLS at the deployment ingress and restrict CORS origins.

## API overview

All REST endpoints are prefixed with `/api`.

| Route | Purpose |
|---|---|
| `POST /api/auth/register`, `POST /api/auth/login` | Create account and issue access/refresh tokens |
| `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me` | Refresh, revoke, and inspect authentication |
| `GET /api/users/me`, `GET /api/users/`, `GET/PATCH /api/users/{id}` | Profile and role-aware user management |
| `POST/GET /api/waste/` | Record waste (user or RFID, grams, meal, optional image) and query history |
| `GET /api/dashboard/stats`, `GET /api/dashboard/charts` | Campus metrics and chart series; filter by `start_date`, `end_date`, `meal_type`, and `user_id` |
| `GET /api/dashboard/leaderboard` | Campus saver ranking |
| `GET /api/predict/?date=YYYY-MM-DD&meal_type=lunch` | Per-item recommended cooking quantities |
| `GET/PUT /api/admin/config`, `GET /api/admin/export.csv` | Admin configuration and CSV export |
| `WS /api/ws/live` | Live waste events, alerts, and score updates |
| `POST /api/hardware/events` | Hardware / MQTT-ready waste event ingestion |

The OpenAPI schema and “Try it out” UI are available at `/docs`; the raw schema is at `/openapi.json`.

## Waste scoring and detections

Disposal events above the configured threshold are marked `high_waste`; other events earn points and can unlock badges. The mock food detector returns plausible Indian canteen items and confidence scores without downloading model weights. The inference endpoint is ready to be replaced with a deployed YOLOv8 model; optional Ultralytics, Prophet, and XGBoost packages are listed in `backend/requirements-ml.txt`. Seeded historical records ensure predictions remain available using the built-in fallback.

The initial demo admin is intentionally convenient for local exploration only. Disable demo seeding, rotate credentials and signing secrets, configure real infrastructure, and review access policies before production use.

## Project layout

```text
backend/             FastAPI application, models, services, seed data, tests
frontend/            React 18 + TypeScript + Vite application
docker-compose.yml   PostgreSQL, Redis, backend, and frontend
.env.example         Local configuration template
```
