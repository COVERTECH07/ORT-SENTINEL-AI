from urllib.parse import parse_qs

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select

from app.core.config import settings
from app.deps import CurrentUser, DbDep
from app.models import User
from app.schemas import RefreshRequest, TokenResponse, UserCreate, UserOut
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


def _tokens(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id, user.token_version),
        refresh_token=create_refresh_token(user.id, user.token_version),
        user=UserOut.from_user(user),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: DbDep):
    email = str(payload.email).lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(
        email=email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role="student",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _tokens(user)


async def _login_values(request: Request) -> tuple[str, str]:
    content_type = request.headers.get("content-type", "").lower()
    try:
        if "application/json" in content_type:
            data = await request.json()
        else:
            form = await request.form()
            data = dict(form)
            if not data:
                body = (await request.body()).decode("utf-8")
                data = {key: values[0] for key, values in parse_qs(body).items() if values}
        email = str(data.get("username") or data.get("email") or "").strip().lower()
        password = str(data.get("password") or "")
        email = TypeAdapter(EmailStr).validate_python(email)
        if not password:
            raise ValueError("Password is required")
        return str(email), password
    except (ValueError, ValidationError, TypeError):
        raise HTTPException(status_code=422, detail="Valid email and password are required")


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, db: DbDep):
    email, password = await _login_values(request)
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    return _tokens(user)


@router.get("/me", response_model=UserOut)
def auth_me(user: CurrentUser):
    return UserOut.from_user(user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: DbDep):
    try:
        claims = decode_token(payload.refresh_token)
        if claims.get("type") != "refresh":
            raise ValueError("Wrong token type")
        user = db.get(User, int(claims["sub"]))
        if not user or not user.is_active or user.token_version != claims.get("ver"):
            raise ValueError("Invalid user")
    except (ValueError, KeyError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    return _tokens(user)


@router.post("/logout")
def logout(user: CurrentUser, db: DbDep):
    user.token_version += 1
    db.commit()
    return {"message": "Logged out successfully"}
