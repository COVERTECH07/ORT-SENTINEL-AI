import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db import SessionLocal, initialize_database
from app.models import User, WasteEntry
from app.security import hash_password
from app.services.configuration import get_config
from app.services.inference import detect_food_items
from app.services.persistence import persist_daily_stats, persist_user_badges
from app.services.scoring import record_weight, reward_event

DEMO_USERS = (
    ("admin@ort.edu", "ORT Administrator", "Admin123!", "admin", "ORT-ADMIN-001"),
    ("manager@ort.edu", "Canteen Manager", "Manager123!", "manager", "ORT-MANAGER-001"),
    ("student1@ort.edu", "Aarav Sharma", "Student123!", "student", "ORT-STUDENT-001"),
    ("student2@ort.edu", "Ananya Patel", "Student123!", "student", "ORT-STUDENT-002"),
    ("student3@ort.edu", "Ishaan Singh", "Student123!", "student", "ORT-STUDENT-003"),
)
MEALS = ("breakfast", "lunch", "dinner")


def seed() -> None:
    initialize_database()
    db = SessionLocal()
    try:
        accounts: list[User] = []
        for email, name, default_password, role, rfid in DEMO_USERS:
            password = os.getenv(f"SEED_PASSWORD_{role.upper()}", default_password)
            user = db.scalar(select(User).where(User.email == email))
            if user is None:
                user = User(
                    email=email,
                    full_name=name,
                    hashed_password=hash_password(password),
                    role=role,
                    rfid_uid=rfid,
                )
                db.add(user)
                db.flush()
            else:
                user.full_name = name
                user.role = role
                if user.rfid_uid is None:
                    user.rfid_uid = rfid
            accounts.append(user)
        db.flush()

        existing_seed = db.scalar(select(WasteEntry.id).where(WasteEntry.source == "seed").limit(1))
        if existing_seed is None:
            threshold = get_config(db)["waste_threshold_grams"]
            students = [user for user in accounts if user.role == "student"]
            now = datetime.now(timezone.utc)
            for day in range(14):
                for student_index, student in enumerate(students):
                    for meal_index, meal in enumerate(MEALS):
                        grams = float(28 + ((day * 17 + student_index * 31 + meal_index * 23) % 123))
                        reward = reward_event(student, grams, threshold)
                        record_weight(student, grams)
                        food_items = detect_food_items(f"seed-{day}-{student_index}-{meal_index}", meal)
                        entry = WasteEntry(
                            user_id=student.id,
                            amount_kg=grams / 1000,
                            weight_grams=grams,
                            meal_type=meal,
                            category="meal-waste",
                            notes="Representative seeded canteen meal event",
                            food_items=food_items,
                            status=str(reward["status"]),
                            points_awarded=int(reward["points_awarded"]),
                            points_delta=int(reward["points_delta"]),
                            score_delta=int(reward["score_delta"]),
                            saved_grams=float(reward["saved_grams"]),
                            source="seed",
                            created_at=now - timedelta(days=13 - day, hours=meal_index * 3, minutes=student_index * 8),
                        )
                        db.add(entry)
                        persist_daily_stats(db, entry)
                    persist_user_badges(db, student)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
    print("Demo users and 14-day sample meal data are ready.")
