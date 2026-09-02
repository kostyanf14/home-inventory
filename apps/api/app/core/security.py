import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import bcrypt
import jwt

from app.core.config import settings

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"

# bcrypt only considers the first 72 bytes of a password; refuse longer input
# instead of silently truncating it.
BCRYPT_MAX_PASSWORD_BYTES = 72

# Used to keep failed logins for unknown emails as expensive as real ones.
_DUMMY_HASH = bcrypt.hashpw(b"invalid-password-placeholder", bcrypt.gensalt()).decode("utf-8")


class TokenError(Exception):
    """Raised when a token cannot be decoded or is not of the expected type."""


def new_session_id() -> str:
    return uuid.uuid4().hex


def _encode(
    subject: str | Any,
    session_id: str,
    token_type: str,
    expires_delta: timedelta,
) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(subject),
        "sid": session_id,
        "typ": token_type,
        "jti": uuid.uuid4().hex,
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(
    subject: str | Any, session_id: str, expires_delta: timedelta | None = None
) -> str:
    delta = expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return _encode(subject, session_id, ACCESS_TOKEN_TYPE, delta)


def create_refresh_token(
    subject: str | Any, session_id: str, expires_delta: timedelta | None = None
) -> str:
    delta = expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return _encode(subject, session_id, REFRESH_TOKEN_TYPE, delta)


def refresh_token_expires_at() -> datetime:
    return datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)


def decode_token(token: str, expected_type: Literal["access", "refresh"]) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise TokenError("Token could not be decoded") from exc

    if payload.get("typ") != expected_type:
        raise TokenError(f"Expected a {expected_type} token")

    session_id = payload.get("sid")
    if not isinstance(session_id, str) or not session_id:
        raise TokenError("Token is missing a session id")

    try:
        payload["user_id"] = int(payload["sub"])
    except (TypeError, ValueError) as exc:
        raise TokenError("Token subject is not a user id") from exc

    return payload


def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode("utf-8")
    if len(password_bytes) > BCRYPT_MAX_PASSWORD_BYTES:
        return False
    try:
        return bcrypt.checkpw(password_bytes, hashed_password.encode("utf-8"))
    except ValueError:
        return False


def verify_password_dummy() -> None:
    """Spend the same time as a real check when the account does not exist."""
    bcrypt.checkpw(b"invalid-password-placeholder", _DUMMY_HASH.encode("utf-8"))


def get_password_hash(password: str) -> str:
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > BCRYPT_MAX_PASSWORD_BYTES:
        raise ValueError(
            f"Password must not exceed {BCRYPT_MAX_PASSWORD_BYTES} bytes when UTF-8 encoded"
        )
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")
