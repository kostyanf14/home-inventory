import pytest
from httpx import AsyncClient


async def setup_location(client: AsyncClient, auth: dict, place_name: str = "Shelf") -> tuple:
    site_response = await client.post("/api/v1/sites", json={"name": "Home"}, headers=auth)
    site_id = site_response.json()["id"]
    place_response = await client.post(
        "/api/v1/places", json={"site_id": site_id, "name": place_name}, headers=auth
    )
    return site_id, place_response.json()["id"]


@pytest.mark.asyncio
async def test_inventory_item_medicine(client: AsyncClient, headers):
    auth = await headers("inventory@example.com")
    site_id, place_id = await setup_location(client, auth, "First Aid Drawer")

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

    item_resp = await client.post("/api/v1/inventory-items", json=med_payload, headers=auth)
    assert item_resp.status_code == 201
    item = item_resp.json()
    assert item["display_name"] == "Ibuprofen 400mg"
    assert item["medicine_details"]["expiration_date"] == "2027-12-31"

    # List items
    list_resp = await client.get("/api/v1/inventory-items?item_type=medicine", headers=auth)
    assert len(list_resp.json()) == 1


@pytest.mark.asyncio
async def test_inventory_item_equipment_optional_dates(client: AsyncClient, headers):
    auth = await headers("equipment@example.com")
    site_id, place_id = await setup_location(client, auth, "Garage")

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
        headers=auth,
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
        headers=auth,
    )
    assert undated_response.status_code == 201
    details = undated_response.json()["equipment_details"]
    assert details["buy_date"] is None
    assert details["warranty_expiration_date"] is None


@pytest.mark.asyncio
async def test_medicine_requires_an_expiration_date(client: AsyncClient, headers):
    auth = await headers("invariants@example.com")
    site_id, place_id = await setup_location(client, auth)

    resp = await client.post(
        "/api/v1/inventory-items",
        json={
            "site_id": site_id,
            "place_id": place_id,
            "item_type": "medicine",
            "display_name": "Unlabelled syrup",
        },
        headers=auth,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_details_must_match_the_item_type(client: AsyncClient, headers):
    auth = await headers("invariants@example.com")
    site_id, place_id = await setup_location(client, auth)

    mismatched = await client.post(
        "/api/v1/inventory-items",
        json={
            "site_id": site_id,
            "place_id": place_id,
            "item_type": "other",
            "display_name": "Box",
            "medicine_details": {"expiration_date": "2027-12-31"},
        },
        headers=auth,
    )
    assert mismatched.status_code == 422

    created = await client.post(
        "/api/v1/inventory-items",
        json={
            "site_id": site_id,
            "place_id": place_id,
            "item_type": "other",
            "display_name": "Box",
        },
        headers=auth,
    )
    item_id = created.json()["id"]

    patched = await client.patch(
        f"/api/v1/inventory-items/{item_id}",
        json={"medicine_details": {"expiration_date": "2027-12-31"}},
        headers=auth,
    )
    assert patched.status_code == 400
    assert "medicine_details" in patched.json()["detail"]


@pytest.mark.asyncio
async def test_quantity_must_be_a_finite_non_negative_number(client: AsyncClient, headers):
    auth = await headers("invariants@example.com")
    site_id, place_id = await setup_location(client, auth)

    base = f'"site_id": {site_id}, "place_id": {place_id}, "display_name": "Box"'
    # Raw bodies: httpx refuses to encode Infinity/NaN, but a hostile client will not.
    for quantity in ["-1", "Infinity", "NaN"]:
        resp = await client.post(
            "/api/v1/inventory-items",
            content=f'{{{base}, "quantity": {quantity}}}',
            headers={**auth, "Content-Type": "application/json"},
        )
        assert resp.status_code == 422, quantity


@pytest.mark.asyncio
async def test_patch_can_relocate_within_the_owners_own_sites(client: AsyncClient, headers):
    auth = await headers("relocate@example.com")
    site_id, place_id = await setup_location(client, auth)

    other_site = await client.post("/api/v1/sites", json={"name": "Office"}, headers=auth)
    other_site_id = other_site.json()["id"]
    other_place = await client.post(
        "/api/v1/places", json={"site_id": other_site_id, "name": "Desk"}, headers=auth
    )
    other_place_id = other_place.json()["id"]

    created = await client.post(
        "/api/v1/inventory-items",
        json={"site_id": site_id, "place_id": place_id, "display_name": "Stapler"},
        headers=auth,
    )
    item_id = created.json()["id"]

    moved = await client.patch(
        f"/api/v1/inventory-items/{item_id}",
        json={"site_id": other_site_id, "place_id": other_place_id},
        headers=auth,
    )
    assert moved.status_code == 200
    assert moved.json()["site_id"] == other_site_id
    assert moved.json()["place_id"] == other_place_id

    # A place from the previous site no longer matches the new site.
    mismatch = await client.patch(
        f"/api/v1/inventory-items/{item_id}", json={"place_id": place_id}, headers=auth
    )
    assert mismatch.status_code == 400
    assert mismatch.json()["detail"] == "Invalid place_id for this site"


@pytest.mark.asyncio
async def test_photo_url_scheme_is_validated(client: AsyncClient, headers):
    auth = await headers("urls@example.com")
    site_id, place_id = await setup_location(client, auth)

    resp = await client.post(
        "/api/v1/inventory-items",
        json={
            "site_id": site_id,
            "place_id": place_id,
            "display_name": "Painting",
            "photo_url": "javascript:alert(1)",
        },
        headers=auth,
    )
    assert resp.status_code == 422
