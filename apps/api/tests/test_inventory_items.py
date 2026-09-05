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
async def test_inventory_item_food(client: AsyncClient, headers):
    auth = await headers("food@example.com")
    site_id, place_id = await setup_location(client, auth, "Pantry")

    item_resp = await client.post(
        "/api/v1/inventory-items",
        json={
            "site_id": site_id,
            "place_id": place_id,
            "item_type": "food",
            "display_name": "Tomato soup",
            "quantity": 4,
            "unit": "cans",
            "food_details": {"expiration_date": "2028-06-01", "form": "canned"},
        },
        headers=auth,
    )
    assert item_resp.status_code == 201
    item = item_resp.json()
    assert item["item_type"] == "food"
    assert item["food_details"]["expiration_date"] == "2028-06-01"
    assert item["food_details"]["form"] == "canned"

    listed = await client.get("/api/v1/inventory-items?item_type=food", headers=auth)
    assert len(listed.json()) == 1


@pytest.mark.asyncio
async def test_food_requires_an_expiration_date(client: AsyncClient, headers):
    auth = await headers("food-invariants@example.com")
    site_id, place_id = await setup_location(client, auth)

    resp = await client.post(
        "/api/v1/inventory-items",
        json={
            "site_id": site_id,
            "place_id": place_id,
            "item_type": "food",
            "display_name": "Beans",
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

    food_on_other = await client.post(
        "/api/v1/inventory-items",
        json={
            "site_id": site_id,
            "place_id": place_id,
            "item_type": "other",
            "display_name": "Box",
            "food_details": {"expiration_date": "2027-12-31"},
        },
        headers=auth,
    )
    assert food_on_other.status_code == 422

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


@pytest.mark.asyncio
async def test_creating_an_item_with_a_barcode_updates_the_local_catalog(
    client: AsyncClient, headers
):
    auth = await headers("catalog-item@example.com")
    site_id, place_id = await setup_location(client, auth)
    barcode = "4006381333931"

    created = await client.post(
        "/api/v1/inventory-items",
        json={
            "site_id": site_id,
            "place_id": place_id,
            "display_name": "Olive oil",
            "barcode": barcode,
            "unit": "bottle",
            "item_type": "equipment",
            "equipment_details": {},
        },
        headers=auth,
    )
    assert created.status_code == 201
    item = created.json()
    assert item["barcode"] == barcode
    assert item["product_id"] is not None

    lookup = await client.post(
        "/api/v1/barcode/lookup",
        json={"barcode": barcode, "local_only": True},
        headers=auth,
    )
    assert lookup.status_code == 200
    data = lookup.json()
    assert data["found"] is True
    assert data["source"] == "local"
    assert data["product"]["id"] == item["product_id"]
    assert data["product"]["name"] == "Olive oil"
    assert data["product"]["default_unit"] == "bottle"
    assert data["product"]["category"] == "equipment"

    again = await client.post(
        "/api/v1/inventory-items",
        json={
            "site_id": site_id,
            "place_id": place_id,
            "display_name": "Olive oil (spare)",
            "barcode": barcode,
        },
        headers=auth,
    )
    assert again.status_code == 201
    assert again.json()["product_id"] == item["product_id"]

    repeat_lookup = await client.post(
        "/api/v1/barcode/lookup",
        json={"barcode": barcode, "local_only": True},
        headers=auth,
    )
    assert repeat_lookup.json()["product"]["name"] == "Olive oil"


@pytest.mark.asyncio
async def test_non_catalog_barcodes_are_stored_on_the_item_only(client: AsyncClient, headers):
    auth = await headers("odd-barcode@example.com")
    site_id, place_id = await setup_location(client, auth)

    created = await client.post(
        "/api/v1/inventory-items",
        json={
            "site_id": site_id,
            "place_id": place_id,
            "display_name": "Handmade label",
            "barcode": "ABC-99",
        },
        headers=auth,
    )
    assert created.status_code == 201
    assert created.json()["barcode"] == "ABC-99"
    assert created.json()["product_id"] is None


@pytest.mark.asyncio
async def test_owner_can_delete_an_inventory_item(client: AsyncClient, headers):
    auth = await headers("delete-item@example.com")
    site_id, place_id = await setup_location(client, auth)

    created = await client.post(
        "/api/v1/inventory-items",
        json={"site_id": site_id, "place_id": place_id, "display_name": "Spare bulb"},
        headers=auth,
    )
    item_id = created.json()["id"]

    deleted = await client.delete(f"/api/v1/inventory-items/{item_id}", headers=auth)
    assert deleted.status_code == 204

    missing = await client.get(f"/api/v1/inventory-items/{item_id}", headers=auth)
    assert missing.status_code == 404

    again = await client.delete(f"/api/v1/inventory-items/{item_id}", headers=auth)
    assert again.status_code == 404


@pytest.mark.asyncio
async def test_using_medicine_reduces_quantity_by_one(client: AsyncClient, headers):
    auth = await headers("use-med@example.com")
    site_id, place_id = await setup_location(client, auth)

    created = await client.post(
        "/api/v1/inventory-items",
        json={
            "site_id": site_id,
            "place_id": place_id,
            "item_type": "medicine",
            "display_name": "Ibuprofen",
            "quantity": 20,
            "unit": "tablets",
            "medicine_details": {"expiration_date": "2027-12-31"},
        },
        headers=auth,
    )
    item_id = created.json()["id"]

    used = await client.post(f"/api/v1/inventory-items/{item_id}/use", headers=auth)
    assert used.status_code == 200
    assert used.json()["quantity"] == 19

    last = await client.post(
        "/api/v1/inventory-items",
        json={
            "site_id": site_id,
            "place_id": place_id,
            "item_type": "medicine",
            "display_name": "Last tablet",
            "quantity": 1,
            "medicine_details": {"expiration_date": "2027-12-31"},
        },
        headers=auth,
    )
    last_id = last.json()["id"]
    emptied = await client.post(f"/api/v1/inventory-items/{last_id}/use", headers=auth)
    assert emptied.json()["quantity"] == 0
    refused = await client.post(f"/api/v1/inventory-items/{last_id}/use", headers=auth)
    assert refused.status_code == 400
    assert refused.json()["detail"] == "Not enough quantity to use 1"


@pytest.mark.asyncio
async def test_use_rejects_non_medicine_items(client: AsyncClient, headers):
    auth = await headers("use-other@example.com")
    site_id, place_id = await setup_location(client, auth)
    created = await client.post(
        "/api/v1/inventory-items",
        json={"site_id": site_id, "place_id": place_id, "display_name": "Hammer"},
        headers=auth,
    )
    resp = await client.post(f"/api/v1/inventory-items/{created.json()['id']}/use", headers=auth)
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Only medicine and food can be used this way"


@pytest.mark.asyncio
async def test_using_food_reduces_quantity_by_one(client: AsyncClient, headers):
    auth = await headers("use-food@example.com")
    site_id, place_id = await setup_location(client, auth)
    created = await client.post(
        "/api/v1/inventory-items",
        json={
            "site_id": site_id,
            "place_id": place_id,
            "item_type": "food",
            "display_name": "Tomato soup",
            "quantity": 4,
            "unit": "cans",
            "food_details": {"expiration_date": "2028-06-01"},
        },
        headers=auth,
    )
    used = await client.post(f"/api/v1/inventory-items/{created.json()['id']}/use", headers=auth)
    assert used.status_code == 200
    assert used.json()["quantity"] == 3


@pytest.mark.asyncio
async def test_patch_can_change_item_type_and_all_fields(client: AsyncClient, headers):
    auth = await headers("edit-item@example.com")
    site_id, place_id = await setup_location(client, auth)
    created = await client.post(
        "/api/v1/inventory-items",
        json={"site_id": site_id, "place_id": place_id, "display_name": "Box"},
        headers=auth,
    )
    item_id = created.json()["id"]

    to_medicine = await client.patch(
        f"/api/v1/inventory-items/{item_id}",
        json={
            "item_type": "medicine",
            "display_name": "Ibuprofen",
            "quantity": 12,
            "unit": "tablets",
            "status": "used",
            "notes": "Kitchen shelf",
            "photo_url": "https://example.com/photo.jpg",
            "barcode": "4006381333931",
            "medicine_details": {
                "expiration_date": "2028-01-01",
                "dosage": "400mg",
                "form": "tablet",
                "requires_prescription": True,
                "batch_number": "B12",
            },
        },
        headers=auth,
    )
    assert to_medicine.status_code == 200
    body = to_medicine.json()
    assert body["item_type"] == "medicine"
    assert body["status"] == "used"
    assert body["notes"] == "Kitchen shelf"
    assert body["photo_url"] == "https://example.com/photo.jpg"
    assert body["medicine_details"]["dosage"] == "400mg"
    assert body["medicine_details"]["requires_prescription"] is True
    assert body["equipment_details"] is None

    to_other = await client.patch(
        f"/api/v1/inventory-items/{item_id}",
        json={"item_type": "other", "status": "active"},
        headers=auth,
    )
    assert to_other.status_code == 200
    assert to_other.json()["item_type"] == "other"
    assert to_other.json()["medicine_details"] is None

    missing_details = await client.patch(
        f"/api/v1/inventory-items/{item_id}",
        json={"item_type": "medicine"},
        headers=auth,
    )
    assert missing_details.status_code == 400
    assert "medicine_details" in missing_details.json()["detail"]

    missing_food = await client.patch(
        f"/api/v1/inventory-items/{item_id}",
        json={"item_type": "food"},
        headers=auth,
    )
    assert missing_food.status_code == 400
    assert "food_details" in missing_food.json()["detail"]

    to_food = await client.patch(
        f"/api/v1/inventory-items/{item_id}",
        json={
            "item_type": "food",
            "display_name": "Beans",
            "unit": "cans",
            "food_details": {"expiration_date": "2029-01-01", "form": "canned"},
        },
        headers=auth,
    )
    assert to_food.status_code == 200
    assert to_food.json()["item_type"] == "food"
    assert to_food.json()["food_details"]["form"] == "canned"
    assert to_food.json()["medicine_details"] is None
