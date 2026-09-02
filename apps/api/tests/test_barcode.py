from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient

EXTERNAL_PAYLOAD = {
    "status": 1,
    "product": {
        "product_name": "Test External Product",
        "brands": "Brand X",
        "categories": "Snacks",
        "image_url": "http://example.com/img.jpg",
    },
}


def off_response(status_code: int, payload: dict | None = None) -> MagicMock:
    response = MagicMock()
    response.status_code = status_code
    response.content = b"{}" if payload is None else b"x" * 100
    response.json.return_value = payload or {}
    return response


@pytest.mark.asyncio
async def test_barcode_lookup_not_found(client: AsyncClient, headers):
    auth = await headers("barcode@example.com")

    with patch("httpx.AsyncClient.get", return_value=off_response(404)):
        resp = await client.post(
            "/api/v1/barcode/lookup", json={"barcode": "000000000000"}, headers=auth
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["found"] is False
    assert data["source"] == "not_found"


@pytest.mark.asyncio
async def test_barcode_lookup_rejects_non_numeric_barcodes(client: AsyncClient, headers):
    auth = await headers("barcode@example.com")

    for barcode in ["", "  ", "12345", "../../etc/passwd", "1234567890123456", "12345\r\nX"]:
        resp = await client.post("/api/v1/barcode/lookup", json={"barcode": barcode}, headers=auth)
        assert resp.status_code == 422, barcode


@pytest.mark.asyncio
async def test_external_lookup_does_not_write_before_the_user_confirms(
    client: AsyncClient, headers
):
    auth = await headers("barcode@example.com")

    with patch("httpx.AsyncClient.get", return_value=off_response(200, EXTERNAL_PAYLOAD)):
        resp = await client.post(
            "/api/v1/barcode/lookup", json={"barcode": "123456789"}, headers=auth
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["found"] is True
    assert data["source"] == "external"
    assert data["product"]["name"] == "Test External Product"
    assert data["product"]["id"] is None

    # Nothing was persisted, so a second lookup still has to ask the provider.
    with patch("httpx.AsyncClient.get", return_value=off_response(404)):
        repeat = await client.post(
            "/api/v1/barcode/lookup", json={"barcode": "123456789"}, headers=auth
        )
    assert repeat.json()["found"] is False

    saved = await client.post(
        "/api/v1/barcode/scan-result/save", json=data["product"], headers=auth
    )
    assert saved.status_code == 201
    assert saved.json()["barcode"] == "123456789"

    local = await client.post("/api/v1/barcode/lookup", json={"barcode": "123456789"}, headers=auth)
    assert local.status_code == 200
    assert local.json()["source"] == "local"
    assert local.json()["product"]["id"] == saved.json()["id"]


@pytest.mark.asyncio
async def test_saving_the_same_barcode_twice_updates_the_row(client: AsyncClient, headers):
    auth = await headers("barcode@example.com")

    first = await client.post(
        "/api/v1/barcode/scan-result/save",
        json={"barcode": "123456789", "name": "First name"},
        headers=auth,
    )
    second = await client.post(
        "/api/v1/barcode/scan-result/save",
        json={"barcode": "123456789", "name": "Corrected name"},
        headers=auth,
    )
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert second.json()["name"] == "Corrected name"


@pytest.mark.asyncio
async def test_external_image_url_scheme_is_filtered(client: AsyncClient, headers):
    auth = await headers("barcode@example.com")
    payload = {
        "status": 1,
        "product": {"product_name": "Sneaky", "image_url": "javascript:alert(1)"},
    }

    with patch("httpx.AsyncClient.get", return_value=off_response(200, payload)):
        resp = await client.post(
            "/api/v1/barcode/lookup", json={"barcode": "123456789"}, headers=auth
        )
    assert resp.json()["product"]["image_url"] is None


@pytest.mark.asyncio
async def test_lookup_requires_authentication(client: AsyncClient):
    resp = await client.post("/api/v1/barcode/lookup", json={"barcode": "123456789"})
    assert resp.status_code == 401
