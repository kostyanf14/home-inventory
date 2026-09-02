import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.mark.asyncio
async def test_register_and_login(client: AsyncClient):
    # Register user
    reg_resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "test@example.com", "password": "securepassword123", "name": "Test User"},
    )
    assert reg_resp.status_code == 201
    data = reg_resp.json()
    assert data["email"] == "test@example.com"
    assert "id" in data

    # Login
    login_resp = await client.post(
        "/api/v1/auth/login", data={"username": "test@example.com", "password": "securepassword123"}
    )
    assert login_resp.status_code == 200
    token_data = login_resp.json()
    assert "access_token" in token_data
    assert "refresh_token" in token_data
    assert token_data["token_type"] == "bearer"
    assert token_data["expires_in"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


@pytest.mark.asyncio
async def test_duplicate_registration_fails(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register", json={"email": "dup@example.com", "password": "password123"}
    )
    resp = await client.post(
        "/api/v1/auth/register", json={"email": "dup@example.com", "password": "password123"}
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Email already registered"


@pytest.mark.asyncio
async def test_email_case_does_not_create_a_second_account(client: AsyncClient):
    first = await client.post(
        "/api/v1/auth/register", json={"email": "Mixed@Example.com", "password": "password123"}
    )
    assert first.status_code == 201
    assert first.json()["email"] == "mixed@example.com"

    second = await client.post(
        "/api/v1/auth/register", json={"email": "mixed@example.com", "password": "password123"}
    )
    assert second.status_code == 400

    login = await client.post(
        "/api/v1/auth/login", data={"username": "MIXED@example.com", "password": "password123"}
    )
    assert login.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("password", ["short", "1234567"])
async def test_register_rejects_weak_passwords(client: AsyncClient, password: str):
    resp = await client.post(
        "/api/v1/auth/register", json={"email": "weak@example.com", "password": password}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_rejects_password_over_bcrypt_limit(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/register", json={"email": "long@example.com", "password": "a" * 80}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_login_is_rate_limited(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register", json={"email": "brute@example.com", "password": "password123"}
    )

    statuses = []
    for _ in range(settings.AUTH_RATE_LIMIT + 2):
        resp = await client.post(
            "/api/v1/auth/login", data={"username": "brute@example.com", "password": "wrong-pass"}
        )
        statuses.append(resp.status_code)

    assert statuses[0] == 401
    assert statuses[-1] == 429
    assert statuses.count(429) == 2


@pytest.mark.asyncio
async def test_unknown_email_and_wrong_password_look_the_same(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register", json={"email": "known@example.com", "password": "password123"}
    )

    wrong_password = await client.post(
        "/api/v1/auth/login", data={"username": "known@example.com", "password": "nope-nope-nope"}
    )
    unknown_email = await client.post(
        "/api/v1/auth/login", data={"username": "nobody@example.com", "password": "nope-nope-nope"}
    )

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


@pytest.mark.asyncio
async def test_meta_reports_environment_without_auth(client: AsyncClient):
    resp = await client.get("/api/v1/meta")
    assert resp.status_code == 200
    assert resp.json() == {"environment": settings.ENVIRONMENT}
