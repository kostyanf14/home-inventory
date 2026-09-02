import { expect, test, type Page } from "@playwright/test";

const SITES = [
  { id: 1, name: "Home" },
  { id: 2, name: "Office" },
];
const PLACES = [
  { id: 10, site_id: 1, name: "Garage" },
  { id: 20, site_id: 2, name: "Desk drawer" },
];

function sampleItems() {
  return [
    {
      id: 1,
      display_name: "Drill",
      item_type: "equipment",
      quantity: 1,
      unit: "pcs",
      site_id: 1,
      place_id: 10,
      status: "active",
      notes: "In the garage",
      equipment_details: { serial_number: "DR-1", buy_date: "2025-01-15" },
    },
    {
      id: 2,
      display_name: "Ibuprofen",
      item_type: "medicine",
      quantity: 20,
      unit: "tablets",
      site_id: 1,
      place_id: 10,
      status: "active",
      medicine_details: { expiration_date: "2027-12-31", dosage: "400mg" },
    },
  ];
}

async function signedIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("inventory-token", "test-token");
    localStorage.setItem("inventory-refresh-token", "test-refresh-token");
    localStorage.setItem("inventory-language", "en");
  });
}

async function mockItems(page: Page, items = sampleItems()) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/inventory-items") && request.method() === "POST") {
      const created = { id: 3, ...(request.postDataJSON() as Record<string, unknown>) };
      items.push(created as (typeof items)[number]);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(created),
      });
      return;
    }

    const patch = /\/inventory-items\/(\d+)$/.exec(path);
    if (patch && request.method() === "PATCH") {
      const id = Number(patch[1]);
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) {
        await route.fulfill({ status: 404, body: "{}" });
        return;
      }
      const update = request.postDataJSON() as Record<string, unknown>;
      items[index] = { ...items[index], ...update };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(items[index]),
      });
      return;
    }

    if (patch && request.method() === "DELETE") {
      const id = Number(patch[1]);
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) {
        await route.fulfill({ status: 404, body: "{}" });
        return;
      }
      items.splice(index, 1);
      await route.fulfill({ status: 204 });
      return;
    }

    const body = path.endsWith("/sites")
      ? SITES
      : path.endsWith("/places")
        ? PLACES
        : path.endsWith("/inventory-items")
          ? items
          : [];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
}

test("creates an item with type details from the items page", async ({ page }) => {
  await signedIn(page);
  const items = sampleItems();
  await mockItems(page, items);
  await page.goto("/items/new");
  await expect(page.getByRole("button", { name: "New item" })).toHaveCount(1);

  await page.getByLabel("Item name").fill("Cough syrup");
  await page.locator("#item-editor-form").getByRole("button", { name: "Medicine" }).click();
  await page.getByLabel("Site").selectOption("1");
  await page.getByLabel("Places").selectOption("10");
  await page.getByLabel("Expiration date").fill("2028-03-01");
  await page.getByLabel("Dosage").fill("5ml");
  await page.getByRole("button", { name: "Create item" }).click();

  await expect(page).toHaveURL("/items/3");
  await expect(page.getByRole("status")).toContainText("Item saved.");
  await expect(page.getByRole("button", { name: "Edit Cough syrup" })).toBeVisible();
});

test("edits every core field on an existing item", async ({ page }) => {
  await signedIn(page);
  let patched: Record<string, unknown> | undefined;
  const items = sampleItems();
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/inventory-items/1") && request.method() === "PATCH") {
      patched = request.postDataJSON() as Record<string, unknown>;
      items[0] = { ...items[0], ...patched };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(items[0]),
      });
      return;
    }
    const body = path.endsWith("/sites")
      ? SITES
      : path.endsWith("/places")
        ? PLACES
        : path.endsWith("/inventory-items")
          ? items
          : [];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/items/1");

  await expect(page.getByRole("heading", { name: "Editing Drill" })).toBeVisible();
  await page.getByLabel("Item name").fill("Cordless drill");
  await page.getByLabel("Status").selectOption("missing");
  await page.getByLabel("Notes").fill("Moved to the shed");
  await page.getByLabel("Serial number").fill("DR-99");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect.poll(() => patched).toMatchObject({
    display_name: "Cordless drill",
    status: "missing",
    notes: "Moved to the shed",
    item_type: "equipment",
    equipment_details: { serial_number: "DR-99" },
  });
  await expect(page.getByRole("status")).toContainText("Item saved.");
});

test("deletes the item being edited", async ({ page }) => {
  await signedIn(page);
  await mockItems(page);
  await page.goto("/items/2");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#item-editor-form").getByRole("button", { name: "Delete item" }).click();

  await expect(page).toHaveURL("/items");
  await expect(page.getByRole("status")).toContainText("Item removed from your inventory.");
  await expect(page.getByRole("button", { name: "Edit Ibuprofen" })).toHaveCount(0);
});

test("opens the editor from the inventory table", async ({ page }) => {
  await signedIn(page);
  await mockItems(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Edit Drill" }).click();
  await expect(page).toHaveURL("/items/1");
  await expect(page.getByRole("heading", { name: "Editing Drill" })).toBeVisible();
});
