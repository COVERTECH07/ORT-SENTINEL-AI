from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db import SessionLocal
from app.models import User
from app.security import decode_token
from app.services.broadcast import broadcaster

router = APIRouter()


@router.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008, reason="Access token required")
        return
    db = SessionLocal()
    try:
        claims = decode_token(token)
        user = db.get(User, int(claims.get("sub", 0)))
        if claims.get("type") != "access" or not user or not user.is_active or user.token_version != claims.get("ver"):
            await websocket.close(code=1008, reason="Invalid access token")
            return
    except (ValueError, TypeError):
        await websocket.close(code=1008, reason="Invalid access token")
        return
    finally:
        db.close()
    await broadcaster.connect(websocket, user.id, user.role)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        broadcaster.disconnect(websocket)
