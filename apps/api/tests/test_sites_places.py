import pytest
from httpx import AsyncClient


async def get_auth_headers(client: AsyncClient, email: str = "sites@example.com") -> dict:
    await client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    resp = await client.post(
        "/api/v1/auth/login", data={"username": email, "password": "password123"}
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_sites_and_places_crud(client: AsyncClient):
    headers = await get_auth_headers(client)

    # Create Site
    site_resp = await client.post(
        "/api/v1/sites",
        json={"name": "Home", "type": "house", "city": "Springfield"},
        headers=headers,
    )
    assert site_resp.status_code == 201
    site = site_resp.json()
    assert site["name"] == "Home"
    site_id = site["id"]

    # List Sites
    sites_list = await client.get("/api/v1/sites", headers=headers)
    assert len(sites_list.json()) == 1

    # Create Place in Site
    place_resp = await client.post(
        "/api/v1/places",
        json={"site_id": site_id, "name": "Kitchen", "type": "room"},
        headers=headers,
    )
    assert place_resp.status_code == 201
    place = place_resp.json()
    assert place["name"] == "Kitchen"
    assert place["site_id"] == site_id

    # List Places
    places_list = await client.get(f"/api/v1/places?site_id={site_id}", headers=headers)
    assert len(places_list.json()) == 1
