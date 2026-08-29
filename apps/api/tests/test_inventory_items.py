import pytest
from httpx import AsyncClient


async def get_auth_headers(client: AsyncClient, email: str = "inventory@example.com") -> dict:
    await client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    resp = await client.post(
        "/api/v1/auth/login", data={"username": email, "password": "password123"}
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_inventory_item_medicine(client: AsyncClient):
    headers = await get_auth_headers(client)

    # Setup Site & Place
    s_resp = await client.post("/api/v1/sites", json={"name": "Home"}, headers=headers)
    site_id = s_resp.json()["id"]
    p_resp = await client.post(
        "/api/v1/places", json={"site_id": site_id, "name": "First Aid Drawer"}, headers=headers
    )
    place_id = p_resp.json()["id"]

    # Create Medicine Item
    med_payload = {
        "site_id": site_id,
        "place_id": place_id,
        "item_type": "medicine",
        "display_name": "Ibuprofen 400mg",
        "quantity": 20.0,
        "unit": "tablets",
        "medicine_details": {
            "expiration_date": "2027-12-31",
            "form": "tablet",
            "requires_prescription": False,
        },
    }

    item_resp = await client.post("/api/v1/inventory-items", json=med_payload, headers=headers)
    assert item_resp.status_code == 201
    item = item_resp.json()
    assert item["display_name"] == "Ibuprofen 400mg"
    assert item["medicine_details"]["expiration_date"] == "2027-12-31"

    # List items
    list_resp = await client.get("/api/v1/inventory-items?item_type=medicine", headers=headers)
    assert len(list_resp.json()) == 1


@pytest.mark.asyncio
async def test_inventory_item_equipment_optional_dates(client: AsyncClient):
    headers = await get_auth_headers(client, email="equipment@example.com")
    site_response = await client.post("/api/v1/sites", json={"name": "Home"}, headers=headers)
    site_id = site_response.json()["id"]
    place_response = await client.post(
        "/api/v1/places", json={"site_id": site_id, "name": "Garage"}, headers=headers
    )
    place_id = place_response.json()["id"]

    dated_response = await client.post(
        "/api/v1/inventory-items",
        json={
            "site_id": site_id,
            "place_id": place_id,
            "item_type": "equipment",
            "display_name": "Drill",
            "equipment_details": {
                "buy_date": "2025-01-15",
                "warranty_expiration_date": "2028-01-15",
            },
        },
        headers=headers,
    )
    assert dated_response.status_code == 201
    details = dated_response.json()["equipment_details"]
    assert details["buy_date"] == "2025-01-15"
    assert details["warranty_expiration_date"] == "2028-01-15"

    undated_response = await client.post(
        "/api/v1/inventory-items",
        json={
            "site_id": site_id,
            "place_id": place_id,
            "item_type": "equipment",
            "display_name": "Hammer",
            "equipment_details": {},
        },
        headers=headers,
    )
    assert undated_response.status_code == 201
    details = undated_response.json()["equipment_details"]
    assert details["buy_date"] is None
    assert details["warranty_expiration_date"] is None
