import pytest
from httpx import AsyncClient

from app.api.endpoints import auth as auth_endpoints
from app.core.config import INSECURE_DEV_SECRET, Settings
from app.core.security import create_access_token, new_session_id


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_refresh_rotates_the_token_pair(client: AsyncClient, login):
    tokens = await login("refresh@example.com")

    rotated = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert rotated.status_code == 200
    new_tokens = rotated.json()
    assert new_tokens["refresh_token"] != tokens["refresh_token"]

    me = await client.get("/api/v1/auth/me", headers=bearer(new_tokens["access_token"]))
    assert me.status_code == 200
    assert me.json()["email"] == "refresh@example.com"


@pytest.mark.asyncio
async def test_replay_inside_the_grace_window_keeps_the_live_session(client: AsyncClient, login):
    """Two tabs refreshing at the same moment must not lock the user out."""
    tokens = await login("race@example.com")

    first = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert first.status_code == 200

    second = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert second.status_code == 200

    me = await client.get("/api/v1/auth/me", headers=bearer(second.json()["access_token"]))
    assert me.status_code == 200


@pytest.mark.asyncio
async def test_leaked_refresh_token_kills_every_session(client: AsyncClient, login, monkeypatch):
    tokens = await login("reuse@example.com")

    first = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert first.status_code == 200
    live_tokens = first.json()

    # Past the race window, a replayed token is a leak, not a parallel tab.
    monkeypatch.setattr(auth_endpoints, "REFRESH_REPLAY_GRACE_SECONDS", 0)
    replay = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert replay.status_code == 401

    # Replay is treated as a leak, so the session issued by the rotation is gone too.
    rotated_me = await client.get("/api/v1/auth/me", headers=bearer(live_tokens["access_token"]))
    assert rotated_me.status_code == 401
    rotated_refresh = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": live_tokens["refresh_token"]}
    )
    assert rotated_refresh.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_the_access_token(client: AsyncClient, login):
    tokens = await login("logout@example.com")
    headers = bearer(tokens["access_token"])

    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 200

    logout = await client.post("/api/v1/auth/logout", headers=headers)
    assert logout.status_code == 204

    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401
    assert (await client.get("/api/v1/sites", headers=headers)).status_code == 401
    replay = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert replay.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_is_not_accepted_as_a_bearer_token(client: AsyncClient, login):
    tokens = await login("typed@example.com")

    resp = await client.get("/api/v1/auth/me", headers=bearer(tokens["refresh_token"]))
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_token_for_an_unknown_session_is_rejected(client: AsyncClient, login):
    await login("forged@example.com")

    # Correctly signed, but no auth_sessions row was ever issued for this sid.
    forged = create_access_token(subject=1, session_id=new_session_id())
    resp = await client.get("/api/v1/auth/me", headers=bearer(forged))
    assert resp.status_code == 401


def test_production_requires_a_real_secret_key():
    with pytest.raises(ValueError):
        Settings(ENVIRONMENT="production", SECRET_KEY="", _env_file=None)
    with pytest.raises(ValueError):
        Settings(ENVIRONMENT="production", SECRET_KEY=INSECURE_DEV_SECRET, _env_file=None)
    with pytest.raises(ValueError):
        Settings(ENVIRONMENT="production", SECRET_KEY="too-short", _env_file=None)

    accepted = Settings(ENVIRONMENT="production", SECRET_KEY="x" * 48, _env_file=None)
    assert accepted.SECRET_KEY == "x" * 48
    assert accepted.docs_enabled is False
    assert accepted.auto_create_tables is False


def test_development_falls_back_to_the_dev_secret():
    dev = Settings(ENVIRONMENT="development", SECRET_KEY="", _env_file=None)
    assert dev.SECRET_KEY == INSECURE_DEV_SECRET
    assert dev.docs_enabled is True
