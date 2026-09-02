from dataclasses import dataclass
from datetime import datetime

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import ACCESS_TOKEN_TYPE, TokenError, decode_token
from app.db.session import get_db
from app.models.models import AuthSession, User, as_utc, utc_now

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


@dataclass
class AuthContext:
    user: User
    session: AuthSession


def session_is_live(auth_session: AuthSession | None, now: datetime | None = None) -> bool:
    if auth_session is None or auth_session.revoked_at is not None:
        return False
    expires_at = as_utc(auth_session.expires_at)
    return expires_at is not None and expires_at > (now or utc_now())


async def load_live_session(db: AsyncSession, session_id: str) -> AuthSession | None:
    result = await db.execute(select(AuthSession).where(AuthSession.session_id == session_id))
    auth_session = result.scalars().first()
    return auth_session if session_is_live(auth_session) else None


async def get_auth_context(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> AuthContext:
    try:
        payload = decode_token(token, ACCESS_TOKEN_TYPE)
    except TokenError as exc:
        raise credentials_exception from exc

    auth_session = await load_live_session(db, payload["sid"])
    if auth_session is None or auth_session.user_id != payload["user_id"]:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == payload["user_id"]))
    user = result.scalars().first()
    if user is None:
        raise credentials_exception
    return AuthContext(user=user, session=auth_session)


async def get_current_user(context: AuthContext = Depends(get_auth_context)) -> User:
    return context.user
