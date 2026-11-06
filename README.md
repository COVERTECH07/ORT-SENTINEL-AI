<div align="center">

<img src="frontend/public/ort-sentinel.svg" alt="ORT Sentinel AI logo" width="96" />

# ORT Sentinel AI

**An intelligent resource-wastage analyser for campus canteens and hostels.**

Track disposal events, classify food, reward low-waste choices, visualise campus impact and forecast cooking demand, all in real time.

![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React_18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Vercel](https://img.shields.io/badge/Frontend-Vercel-000000?logo=vercel&logoColor=white)
![Render](https://img.shields.io/badge/Backend-Render-46E3B7?logo=render&logoColor=black)

</div>

---

## Live Demo

| Service | Platform | Link |
|---|---|---|
| Web app (dashboard + student portal) | Vercel | https://ort-sentinel-ai.vercel.app |
| REST API | Render | https://ort-sentinel-ai.onrender.com |
| Interactive API docs (Swagger) | Render | https://ort-sentinel-ai.onrender.com/docs |
| Health check | Render | https://ort-sentinel-ai.onrender.com/health |

> The backend runs on Render's free plan. The first request after inactivity can take 30–60 seconds while the service wakes up.

### Demo logins (always work after backend wakes)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@ort.edu` | `Admin123!` |
| Manager | `manager@ort.edu` | `Manager123!` |
| Student | `student1@ort.edu` | `Student123!` |

These accounts are seeded automatically. Disable seeding and rotate credentials for any real deployment.

---

## Project phases (matches PPT + Q&A guide)

| Phase | Scope | Status in this repo |
|---|---|---|
| **Phase 1** | Weight + RFID tracking, alerts, rewards, Waste Score, live dashboard | **Complete** (software fully ready) |
| **Phase 2** | Vision AI (YOLOv8 food recognition) + demand prediction (XGBoost/Prophet) | **Complete** (mock detector + real forecasting pipeline ready; swap in trained weights later) |
| **Phase 3** | Mobile app, multi-bin, water/electricity, full edge hardware | Planned (hardware-ready endpoints + MQTT already present) |

Software (web app + API) is production-ready for Phase 1 & 2 demos. Hardware (ESP32 + sensors) is the next step.

---

## Why ORT Sentinel?

Canteens and hostels throw away a lot of edible food, and nobody sees where or why. ORT Sentinel makes waste visible: every disposal is logged, scored and fed back to the student, while managers get dashboards and per-item forecasts to cook only what will be eaten.

## Features

- **Waste tracking:** record disposal events by user or RFID card, with grams, meal type and an optional image.
- **Food detection:** YOLO-ready inference interface with a realistic deterministic mock detector (works without model weights).
- **Rewards and leaderboard:** low-waste events earn points and unlock badges; campus leaderboard ranks the best savers.
- **Manager dashboard:** campus metrics and charts, filterable by date range, meal type and user.
- **Student impact portal:** personal score, badges, money and CO₂ saved.
- **Live updates:** authenticated WebSocket feed for waste events, high-waste alerts and score changes.
- **Demand forecasting:** per-item recommended cooking quantities (Prophet/XGBoost optional + deterministic fallback).
- **Admin tools:** configurable sustainability factors (money/kg, CO₂/kg, threshold) and CSV export.
- **Hardware-ready:** event-ingestion endpoint + MQTT settings for smart bins.
- **Secure by default:** JWT access + refresh tokens with role-based access control.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts, Axios, React Router |
| Backend | FastAPI, Uvicorn, SQLAlchemy 2, Pydantic v2 |
| Auth | JWT (python-jose), bcrypt (passlib) |
| Database | PostgreSQL (deployment/Compose), SQLite (local development) |
| Realtime | WebSockets, optional Redis cache and pub/sub |
| ML (optional) | Ultralytics YOLOv8, Prophet, XGBoost |
| Hardware | MQTT (paho-mqtt) |
| DevOps | Docker, Docker Compose, Nginx, Vercel, Render |

## Architecture

```text
 ┌──────────────┐   HTTPS / WebSocket   ┌─────────────────────────┐
 │  React + Vite │ ────────────────────▶ │  FastAPI  (/api, /ws)   │
 │   (Vercel)    │ ◀──────────────────── │        (Render)         │
 └──────────────┘                        └───────┬─────────┬───────┘
                                                 │         │
                          ┌──────────────────────┘         └──────────────┐
                          ▼                                               ▼
                 PostgreSQL / SQLite                          Redis (optional) · MQTT (optional)
                 users, waste events,                         cache, cross-worker pub/sub,
                 badges, daily stats                          smart-bin events
```

## Project Structure

```text
.
├── backend/              FastAPI app: routers, models, services, seed data
│   ├── app/routers/      auth, users, waste, dashboard, predict, admin, hardware, live
│   ├── app/services/     scoring, inference, prediction, broadcast, persistence
│   ├── seed.py           idempotent demo data seeder
│   └── requirements*.txt core and optional ML dependencies
├── frontend/             React 18 + TypeScript + Vite application
├── docker-compose.yml    PostgreSQL, Redis, backend and frontend
└── .env.example          configuration template
```

---

## Getting Started

### Option 1: Docker Compose

Requires Docker with Compose.

```bash
cp .env.example .env
# Set POSTGRES_PASSWORD and JWT_SECRET_KEY to strong, unique values
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:8080 |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

With `SEED_DEMO_DATA=true` (default), the backend creates the schema and seeds demo users + two weeks of events on startup.

### Option 2: Local development

**Backend** (Python 3.11+):

```bash
cp .env.example .env
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export JWT_SECRET_KEY="local-development-only-change-this-secret"
python seed.py
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Local runs use SQLite by default (`backend/ort_sentinel_fallback.db`). Redis is optional.

**Frontend** (in a second terminal):

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Vite proxies `/api` (including WebSockets) to `http://127.0.0.1:8000`. Set `VITE_API_URL` only if the API lives on a different origin.

Optional ML packages (YOLOv8, Prophet, XGBoost):

```bash
pip install -r backend/requirements-ml.txt
```

---

## Configuration

Copy `.env.example` to `.env`.

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | SQLAlchemy URL (PostgreSQL or SQLite) | SQLite locally, PostgreSQL in Compose |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | PostgreSQL credentials | `ort_sentinel`, `ort`, set your own |
| `JWT_SECRET_KEY` | Signing key for access and refresh tokens | **set a strong secret** |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime | `30` |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime | `14` |
| `WASTE_THRESHOLD_GRAMS` | High-waste alert threshold | `100` |
| `MONEY_PER_KG` | Estimated rupees saved per kg | `50` |
| `CO2_PER_KG` | Estimated kg CO₂ avoided per kg saved | `2.5` |
| `CORS_ORIGINS` | Comma-separated allowed browser origins | local + Vercel |
| `SEED_DEMO_DATA` | Seed demo users and events on startup | `true` |
| `REDIS_URL` | Optional cache and pub/sub | disabled locally |
| `MQTT_BROKER`, `MQTT_PORT`, `MQTT_TOPIC` | Optional smart-bin broker | disabled |

---

## Deployment

The live demo is split across two platforms.

**Backend on Render** (web service)

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Auto-deploy | on commits to `main` |

Set `JWT_SECRET_KEY`, `DATABASE_URL`, and ensure `CORS_ORIGINS` includes your frontend origin.

**Frontend on Vercel**

- Framework preset: Vite, root directory `frontend`, build command `npm run build`, output directory `dist`.
- Set `VITE_API_URL` to `https://ort-sentinel-ai.onrender.com/api`.

Before going public: disable demo seeding, rotate secrets and passwords, serve over TLS and restrict CORS to your real origins.

---

## API Overview

All REST endpoints are prefixed with `/api`. Full details are in the Swagger UI at `/docs`.

| Route | Purpose |
|---|---|
| `POST /api/auth/register`, `POST /api/auth/login` | Create an account and issue tokens |
| `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me` | Refresh, revoke and inspect authentication |
| `GET /api/users/me`, `GET /api/users/`, `GET/PATCH /api/users/{id}` | Profile and role-aware user management |
| `POST/GET /api/waste/` | Record waste and query history |
| `GET /api/dashboard/stats`, `GET /api/dashboard/charts` | Campus metrics and chart series |
| `GET /api/dashboard/leaderboard` | Campus saver ranking |
| `GET /api/predict/?date=YYYY-MM-DD&meal_type=lunch` | Recommended cooking quantities per item |
| `GET/PUT /api/admin/config`, `GET /api/admin/export.csv` | Admin configuration and CSV export |
| `WS /api/ws/live` | Live events, alerts and score updates |
| `POST /api/hardware/events` | Hardware / MQTT-ready waste event ingestion |
| `GET /health` | Service health check |

## How scoring works

Disposal events above `WASTE_THRESHOLD_GRAMS` are flagged as `high_waste`. Every other event earns points and can unlock badges. Savings are estimated with `MONEY_PER_KG` and `CO2_PER_KG`, and both are configurable from the admin settings.

## Roadmap (next after software)

1. Train & deploy real YOLOv8 food-detection weights (replace mock).
2. Connect real smart-bin hardware (ESP32 + load cell + RFID + camera) via MQTT / `/api/hardware/events`.
3. Multi-bin support + mobile app (Phase 3).
4. Automated tests + CI.

---

<div align="center">

Built to cut campus food waste. If this project helps you, consider giving it a star.

</div>
