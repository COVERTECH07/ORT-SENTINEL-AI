import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

from app.core.config import settings

logger = logging.getLogger(__name__)


class LiveBroadcaster:
    def __init__(self) -> None:
        self.connections: set[WebSocket] = set()
        self.identities: dict[WebSocket, tuple[int, str]] = {}
        self.redis: Any = None
        self.pubsub_task: asyncio.Task | None = None

    async def start(self) -> None:
        if not settings.redis_url:
            return
        try:
            from redis.asyncio import Redis

            self.redis = Redis.from_url(settings.redis_url, decode_responses=True)
            await self.redis.ping()
            self.pubsub_task = asyncio.create_task(self._listen_redis())
        except Exception:
            logger.exception("Redis unavailable; live events will use process-local broadcast")
            self.redis = None

    async def stop(self) -> None:
        if self.pubsub_task:
            self.pubsub_task.cancel()
            try:
                await self.pubsub_task
            except asyncio.CancelledError:
                pass
        if self.redis:
            await self.redis.aclose()
            self.redis = None

    async def connect(self, websocket: WebSocket, user_id: int, role: str) -> None:
        await websocket.accept()
        self.connections.add(websocket)
        self.identities[websocket] = (user_id, role)

    def disconnect(self, websocket: WebSocket) -> None:
        self.connections.discard(websocket)
        self.identities.pop(websocket, None)

    async def publish(self, event: dict[str, Any]) -> None:
        if self.redis:
            try:
                await self.redis.publish("ort-sentinel:live", json.dumps(event, default=str))
                return
            except Exception:
                logger.exception("Redis publish failed")
        await self._broadcast(event)

    async def _broadcast(self, event: dict[str, Any]) -> None:
        stale: list[WebSocket] = []
        for connection in tuple(self.connections):
            user_id, role = self.identities.get(connection, (0, "student"))
            if role == "student" and event.get("user_id") != user_id:
                continue
            try:
                await connection.send_json(event)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection)

    async def _listen_redis(self) -> None:
        pubsub = self.redis.pubsub()
        await pubsub.subscribe("ort-sentinel:live")
        try:
            async for message in pubsub.listen():
                if message.get("type") == "message":
                    try:
                        await self._broadcast(json.loads(message["data"]))
                    except (ValueError, TypeError):
                        logger.warning("Ignoring invalid Redis live event")
        finally:
            await pubsub.aclose()


broadcaster = LiveBroadcaster()
