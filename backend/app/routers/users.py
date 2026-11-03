from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.deps import CurrentUser, DbDep, require_roles
from app.models import User
from app.schemas import UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def get_me(user: CurrentUser):
    return UserOut.from_user(user)


@router.get("/", response_model=list[UserOut])
def list_users(db: DbDep, _: User = Depends(require_roles("admin", "manager"))):
    users = db.scalars(select(User).order_by(User.id)).all()
    return [UserOut.from_user(user) for user in users]


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: DbDep, current: CurrentUser):
    if current.role not in {"admin", "manager"} and current.id != user_id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserOut.from_user(user)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: DbDep,
    current: CurrentUser,
):
    if current.role not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    updates = payload.model_dump(exclude_unset=True)
    if current.role != "admin" and any(key not in {"full_name", "rfid_uid"} for key in updates):
        raise HTTPException(status_code=403, detail="Managers may update names and RFID mapping only")
    if updates.get("rfid_uid"):
        existing = db.scalar(select(User).where(User.rfid_uid == updates["rfid_uid"], User.id != user_id))
        if existing:
            raise HTTPException(status_code=409, detail="RFID UID is already assigned")
        updates["rfid_uid"] = updates["rfid_uid"].strip()
    for key, value in updates.items():
        setattr(user, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="RFID UID is already assigned")
    db.refresh(user)
    return UserOut.from_user(user)
