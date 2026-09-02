"""Small in-process sliding-window rate limiter for the auth endpoints.

This is deliberately simple: it protects a single API process against online
password guessing and registration floods. A multi-process or multi-instance
deployment needs a shared backend (Redis) to be effective.
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import settings


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def hit(self, key: str, limit: int, window_seconds: int) -> int:
        """Record a hit and return the number of seconds to wait, or 0 when allowed."""
        now = time.monotonic()
        window_start = now - window_seconds
        hits = self._hits[key]
        while hits and hits[0] < window_start:
            hits.popleft()

        if len(hits) >= limit:
            return max(1, int(hits[0] + window_seconds - now) + 1)

        hits.append(now)
        return 0

    def reset(self) -> None:
        self._hits.clear()


auth_limiter = SlidingWindowRateLimiter()


def client_key(request: Request, scope: str, identity: str | None = None) -> str:
    host = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        host = forwarded.split(",")[0].strip() or host
    parts = [scope, host]
    if identity:
        parts.append(identity.strip().lower())
    return "|".join(parts)


def enforce_auth_rate_limit(request: Request, scope: str, identity: str | None = None) -> None:
    retry_after = auth_limiter.hit(
        client_key(request, scope, identity),
        settings.AUTH_RATE_LIMIT,
        settings.AUTH_RATE_WINDOW_SECONDS,
    )
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )
