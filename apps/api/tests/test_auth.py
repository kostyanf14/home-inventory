import pytest
from httpx import AsyncClient


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
    assert token_data["token_type"] == "bearer"


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
