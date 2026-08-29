from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient


async def get_auth_headers(client: AsyncClient, email: str = "barcode@example.com") -> dict:
    await client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    resp = await client.post(
        "/api/v1/auth/login", data={"username": email, "password": "password123"}
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_barcode_lookup_not_found(client: AsyncClient):
    headers = await get_auth_headers(client)

    mock_resp = MagicMock()
    mock_resp.status_code = 404
    with patch("httpx.AsyncClient.get", return_value=mock_resp):
        resp = await client.post(
            "/api/v1/barcode/lookup", json={"barcode": "000000000000"}, headers=headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["found"] is False
        assert data["source"] == "not_found"


@pytest.mark.asyncio
async def test_barcode_lookup_external_mock(client: AsyncClient):
    headers = await get_auth_headers(client)

    mock_off_response = MagicMock()
    mock_off_response.status_code = 200
    mock_off_response.json.return_value = {
        "status": 1,
        "product": {
            "product_name": "Test External Product",
            "brands": "Brand X",
            "categories": "Snacks",
            "image_url": "http://example.com/img.jpg",
        },
    }

    with patch("httpx.AsyncClient.get", return_value=mock_off_response):
        resp = await client.post(
            "/api/v1/barcode/lookup", json={"barcode": "123456789"}, headers=headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["found"] is True
        assert data["source"] == "external"
        assert data["product"]["name"] == "Test External Product"

    # Subsequent lookup should find it in local catalog
    resp_local = await client.post(
        "/api/v1/barcode/lookup", json={"barcode": "123456789"}, headers=headers
    )
    assert resp_local.status_code == 200
    data_local = resp_local.json()
    assert data_local["found"] is True
    assert data_local["source"] == "local"
