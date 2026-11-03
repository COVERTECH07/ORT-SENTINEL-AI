from app.models import User


def reward_event(user: User, weight_grams: float, threshold_grams: float) -> dict[str, int | float | str]:
    badges = list(user.badges or [])
    if weight_grams > threshold_grams:
        user.high_waste_events = (user.high_waste_events or 0) + 1
        user.current_low_streak = 0
        score_delta = -min(10, user.waste_score or 0)
        points_delta = -min(10, user.total_points or 0)
        user.waste_score = (user.waste_score or 0) + score_delta
        user.total_points = (user.total_points or 0) + points_delta
        badges = [badge for badge in badges if badge != "Low-waste streak"]
        user.badges = badges
        return {
            "status": "high_waste",
            "points_awarded": 0,
            "points_delta": points_delta,
            "score_delta": score_delta,
            "saved_grams": 0.0,
        }

    points = max(1, round(20 * (1 - weight_grams / threshold_grams)))
    user.low_waste_events = (user.low_waste_events or 0) + 1
    user.current_low_streak = (user.current_low_streak or 0) + 1
    score_delta = points
    user.waste_score = (user.waste_score or 0) + points
    user.total_points = (user.total_points or 0) + points
    badge_milestones = (
        (1, "First low-waste meal"),
        (5, "Waste warrior"),
        (20, "Sustainability champion"),
    )
    for count, badge in badge_milestones:
        if user.low_waste_events >= count and badge not in badges:
            badges.append(badge)
    if user.current_low_streak >= 3 and "Low-waste streak" not in badges:
        badges.append("Low-waste streak")
    user.badges = badges
    return {
        "status": "low_waste",
        "points_awarded": points,
        "points_delta": points,
        "score_delta": score_delta,
        "saved_grams": round(max(0.0, threshold_grams - weight_grams), 2),
    }


def record_weight(user: User | None, weight_grams: float) -> None:
    if user is not None:
        user.total_waste_grams = (user.total_waste_grams or 0.0) + weight_grams
