import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_sites_and_places_crud(client: AsyncClient, headers):
    auth = await headers("sites@example.com")

    # Create Site
    site_resp = await client.post(
        "/api/v1/sites",
        json={"name": "Home", "type": "house", "city": "Springfield"},
        headers=auth,
    )
    assert site_resp.status_code == 201
    site = site_resp.json()
    assert site["name"] == "Home"
    site_id = site["id"]

    # List Sites
    sites_list = await client.get("/api/v1/sites", headers=auth)
    assert len(sites_list.json()) == 1

    # Create Place in Site
    place_resp = await client.post(
        "/api/v1/places",
        json={"site_id": site_id, "name": "Kitchen", "type": "room"},
        headers=auth,
    )
    assert place_resp.status_code == 201
    place = place_resp.json()
    assert place["name"] == "Kitchen"
    assert place["site_id"] == site_id

    # List Places
    places_list = await client.get(f"/api/v1/places?site_id={site_id}", headers=auth)
    assert len(places_list.json()) == 1

    # Each place is listed once, even with a parent in the same site
    await client.post(
        "/api/v1/places",
        json={"site_id": site_id, "name": "Shelf", "parent_place_id": place["id"]},
        headers=auth,
    )
    all_places = await client.get("/api/v1/places", headers=auth)
    assert len({item["id"] for item in all_places.json()}) == len(all_places.json()) == 2


@pytest.mark.asyncio
async def test_place_create_rejects_a_site_the_caller_does_not_own(client: AsyncClient, headers):
    auth = await headers("places@example.com")

    resp = await client.post(
        "/api/v1/places", json={"site_id": 4242, "name": "Ghost room"}, headers=auth
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid site_id"


@pytest.mark.asyncio
async def test_blank_names_are_rejected(client: AsyncClient, headers):
    auth = await headers("names@example.com")

    resp = await client.post("/api/v1/sites", json={"name": "   "}, headers=auth)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_sqlite_enforces_foreign_keys(db: AsyncSession):
    enabled = await db.execute(text("PRAGMA foreign_keys"))
    assert enabled.scalar() == 1

    with pytest.raises(Exception):  # noqa: B017 - driver-specific IntegrityError
        await db.execute(
            text(
                "INSERT INTO places (site_id, name, created_at, updated_at) "
                "VALUES (9999, 'Orphan', '2026-01-01', '2026-01-01')"
            )
        )
        await db.commit()
