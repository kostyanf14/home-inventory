"""Two-user tests: nothing a user writes may reach into another user's data."""

from unittest.mock import patch

import pytest
from httpx import AsyncClient

ATTACKER = "attacker@example.com"
VICTIM = "victim@example.com"


async def make_location(
    client: AsyncClient, owner_headers: dict, site_name: str
) -> tuple[int, int]:
    site = await client.post("/api/v1/sites", json={"name": site_name}, headers=owner_headers)
    assert site.status_code == 201
    site_id = site.json()["id"]
    place = await client.post(
        "/api/v1/places",
        json={"site_id": site_id, "name": f"{site_name} shelf"},
        headers=owner_headers,
    )
    assert place.status_code == 201
    return site_id, place.json()["id"]


async def make_item(client: AsyncClient, owner_headers: dict, site_id: int, place_id: int) -> int:
    item = await client.post(
        "/api/v1/inventory-items",
        json={"site_id": site_id, "place_id": place_id, "display_name": "Torch"},
        headers=owner_headers,
    )
    assert item.status_code == 201
    return item.json()["id"]


@pytest.mark.asyncio
async def test_patch_item_cannot_relocate_into_another_users_site(client: AsyncClient, headers):
    attacker = await headers(ATTACKER)
    victim = await headers(VICTIM)

    attacker_site, attacker_place = await make_location(client, attacker, "Attacker")
    victim_site, victim_place = await make_location(client, victim, "Victim")
    item_id = await make_item(client, attacker, attacker_site, attacker_place)

    hijack = await client.patch(
        f"/api/v1/inventory-items/{item_id}",
        json={"site_id": victim_site, "place_id": victim_place},
        headers=attacker,
    )
    assert hijack.status_code == 400
    assert hijack.json()["detail"] == "Invalid site_id"

    # Only the place, keeping the attacker's own site, must fail too.
    place_only = await client.patch(
        f"/api/v1/inventory-items/{item_id}",
        json={"place_id": victim_place},
        headers=attacker,
    )
    assert place_only.status_code == 400

    unchanged = await client.get(f"/api/v1/inventory-items/{item_id}", headers=attacker)
    assert unchanged.json()["site_id"] == attacker_site
    assert unchanged.json()["place_id"] == attacker_place


@pytest.mark.asyncio
async def test_patch_place_cannot_adopt_another_users_place(client: AsyncClient, headers):
    attacker = await headers(ATTACKER)
    victim = await headers(VICTIM)

    _, attacker_place = await make_location(client, attacker, "Attacker")
    _, victim_place = await make_location(client, victim, "Victim")

    hijack = await client.patch(
        f"/api/v1/places/{attacker_place}",
        json={"parent_place_id": victim_place},
        headers=attacker,
    )
    assert hijack.status_code == 400

    self_parent = await client.patch(
        f"/api/v1/places/{attacker_place}",
        json={"parent_place_id": attacker_place},
        headers=attacker,
    )
    assert self_parent.status_code == 400

    missing_parent = await client.patch(
        f"/api/v1/places/{attacker_place}",
        json={"parent_place_id": 99999},
        headers=attacker,
    )
    assert missing_parent.status_code == 400


@pytest.mark.asyncio
async def test_parent_place_cycle_is_rejected(client: AsyncClient, headers):
    owner = await headers("cycles@example.com")
    site_id, root_place = await make_location(client, owner, "Home")

    child = await client.post(
        "/api/v1/places",
        json={"site_id": site_id, "name": "Shelf", "parent_place_id": root_place},
        headers=owner,
    )
    assert child.status_code == 201
    child_id = child.json()["id"]

    cycle = await client.patch(
        f"/api/v1/places/{root_place}", json={"parent_place_id": child_id}, headers=owner
    )
    assert cycle.status_code == 400
    assert "cycle" in cycle.json()["detail"]


@pytest.mark.asyncio
async def test_reads_and_deletes_stay_scoped_to_the_owner(client: AsyncClient, headers):
    attacker = await headers(ATTACKER)
    victim = await headers(VICTIM)

    victim_site, victim_place = await make_location(client, victim, "Victim")
    victim_item = await make_item(client, victim, victim_site, victim_place)

    assert (await client.get(f"/api/v1/sites/{victim_site}", headers=attacker)).status_code == 404
    assert (await client.get(f"/api/v1/places/{victim_place}", headers=attacker)).status_code == 404
    assert (
        await client.get(f"/api/v1/inventory-items/{victim_item}", headers=attacker)
    ).status_code == 404
    assert (
        await client.delete(f"/api/v1/inventory-items/{victim_item}", headers=attacker)
    ).status_code == 404
    assert (
        await client.delete(f"/api/v1/sites/{victim_site}", headers=attacker)
    ).status_code == 404
    assert (await client.get("/api/v1/sites", headers=attacker)).json() == []
    assert (await client.get("/api/v1/places", headers=attacker)).json() == []
    assert (await client.get("/api/v1/inventory-items", headers=attacker)).json() == []


@pytest.mark.asyncio
async def test_products_are_isolated_between_users(client: AsyncClient, headers):
    attacker = await headers(ATTACKER)
    victim = await headers(VICTIM)

    saved = await client.post(
        "/api/v1/barcode/scan-result/save",
        json={"barcode": "5901234123457", "name": "Victim Cereal"},
        headers=victim,
    )
    assert saved.status_code == 201
    victim_product = saved.json()["id"]

    # The attacker's lookup must not see the victim's catalog row.
    with patch("app.api.endpoints.barcode.fetch_external_product", return_value=None):
        lookup = await client.post(
            "/api/v1/barcode/lookup", json={"barcode": "5901234123457"}, headers=attacker
        )
    assert lookup.json()["found"] is False

    # And the attacker cannot attach the victim's product to their own item.
    site_id, place_id = await make_location(client, attacker, "Attacker")
    item = await client.post(
        "/api/v1/inventory-items",
        json={
            "site_id": site_id,
            "place_id": place_id,
            "display_name": "Cereal",
            "product_id": victim_product,
        },
        headers=attacker,
    )
    assert item.status_code == 400
    assert item.json()["detail"] == "Invalid product_id"


@pytest.mark.asyncio
async def test_same_barcode_can_be_saved_by_two_users(client: AsyncClient, headers):
    first = await headers("first@example.com")
    second = await headers("second@example.com")

    payload = {"barcode": "4006381333931", "name": "Shared Barcode"}
    assert (
        await client.post("/api/v1/barcode/scan-result/save", json=payload, headers=first)
    ).status_code == 201
    assert (
        await client.post("/api/v1/barcode/scan-result/save", json=payload, headers=second)
    ).status_code == 201
