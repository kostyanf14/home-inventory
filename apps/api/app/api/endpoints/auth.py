from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, credentials_exception, get_auth_context, load_live_session
from app.core.config import settings
from app.core.rate_limit import enforce_auth_rate_limit
from app.core.security import (
    REFRESH_TOKEN_TYPE,
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    new_session_id,
    refresh_token_expires_at,
    verify_password,
    verify_password_dummy,
)
from app.db.session import get_db
from app.models.models import AuthSession, User, as_utc, utc_now
from app.schemas.schemas import RefreshRequest, Token, UserCreate, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])

# Window in which a replayed refresh token is treated as a parallel-tab race
# rather than a leak.
REFRESH_REPLAY_GRACE_SECONDS = 15


def tokens_for(user: User, session_id: str) -> Token:
    return Token(
        access_token=create_access_token(subject=user.id, session_id=session_id),
        refresh_token=create_refresh_token(subject=user.id, session_id=session_id),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


async def issue_tokens(db: AsyncSession, user: User) -> Token:
    session_id = new_session_id()
    db.add(
        AuthSession(
            user_id=user.id,
            session_id=session_id,
            expires_at=refresh_token_expires_at(),
        )
    )
    await db.commit()
    return tokens_for(user, session_id)


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(request: Request, user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    enforce_auth_rate_limit(request, "register")

    result = await db.execute(select(User).where(User.email == user_in.email))
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    user = User(
        email=user_in.email,
        password_hash=get_password_hash(user_in.password),
        name=user_in.name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    email = form_data.username.strip().lower()
    enforce_auth_rate_limit(request, "login", email)

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()
    if user is None:
        # Keep the response time comparable to a wrong password for a real account.
        verify_password_dummy()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return await issue_tokens(db, user)


@router.post("/refresh", response_model=Token)
async def refresh(request: Request, payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    enforce_auth_rate_limit(request, "refresh")

    try:
        claims = decode_token(payload.refresh_token, REFRESH_TOKEN_TYPE)
    except TokenError as exc:
        raise credentials_exception from exc

    result = await db.execute(select(User).where(User.id == claims["user_id"]))
    user = result.scalars().first()
    if user is None:
        raise credentials_exception

    auth_session = await load_live_session(db, claims["sid"])
    if auth_session is None or auth_session.user_id != claims["user_id"]:
        replacement = await recent_rotation(db, claims)
        if replacement is not None:
            # Two tabs refreshed at once: hand back the session the winner created.
            return tokens_for(user, replacement.session_id)
        # Otherwise a refresh token was presented after its session ended, which
        # means it leaked; drop every session so the holder cannot keep rotating.
        await revoke_all_sessions(db, claims["user_id"])
        raise credentials_exception

    auth_session.revoked_at = utc_now()
    tokens = await issue_tokens(db, user)
    auth_session.rotated_to = decode_token(tokens.refresh_token, REFRESH_TOKEN_TYPE)["sid"]
    await db.commit()
    return tokens


async def recent_rotation(db: AsyncSession, claims: dict) -> AuthSession | None:
    """The live session this token was just rotated into, if that happened moments ago."""
    result = await db.execute(select(AuthSession).where(AuthSession.session_id == claims["sid"]))
    rotated = result.scalars().first()
    if rotated is None or rotated.user_id != claims["user_id"] or not rotated.rotated_to:
        return None

    revoked_at = as_utc(rotated.revoked_at)
    if revoked_at is None:
        return None
    if (utc_now() - revoked_at).total_seconds() > REFRESH_REPLAY_GRACE_SECONDS:
        return None
    return await load_live_session(db, rotated.rotated_to)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    context: AuthContext = Depends(get_auth_context), db: AsyncSession = Depends(get_db)
):
    context.session.revoked_at = utc_now()
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserRead)
async def read_me(context: AuthContext = Depends(get_auth_context)):
    return context.user


async def revoke_all_sessions(db: AsyncSession, user_id: int) -> None:
    result = await db.execute(
        select(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
    )
    now = utc_now()
    for auth_session in result.scalars().all():
        auth_session.revoked_at = now
    await db.commit()
