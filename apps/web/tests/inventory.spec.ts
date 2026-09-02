import { expect, test, type Page } from "@playwright/test";

const SITES = [
  { id: 1, name: "Home" },
  { id: 2, name: "Office" },
];
const PLACES = [
  { id: 10, site_id: 1, name: "Garage" },
  { id: 20, site_id: 2, name: "Desk drawer" },
];
const ITEMS = [
  {
    id: 1,
    display_name: "Drill",
    item_type: "equipment",
    quantity: 1,
    unit: "pcs",
    site_id: 1,
    place_id: 10,
    barcode: "4006381333931",
    status: "active",
  },
  {
    id: 2,
    display_name: "Ibuprofen",
    item_type: "medicine",
    quantity: 20,
    unit: "tablets",
    site_id: 2,
    place_id: 20,
    status: "active",
    medicine_details: { expiration_date: "2027-12-31" },
  },
];

async function signedIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("inventory-token", "test-token");
    localStorage.setItem("inventory-refresh-token", "test-refresh-token");
    localStorage.setItem("inventory-language", "en");
  });
}

async function mockInventory(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("/sites")
      ? SITES
      : path.endsWith("/places")
        ? PLACES
        : path.endsWith("/inventory-items")
          ? ITEMS
          : [];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
}

test("filters the inventory table from the search box", async ({ page }) => {
  await signedIn(page);
  await mockInventory(page);
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Delete Drill" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Ibuprofen" })).toBeVisible();

  const search = page.getByRole("textbox", { name: "Search inventory" });
  await search.fill("ibupro");
  await expect(page.getByRole("button", { name: "Delete Drill" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Delete Ibuprofen" })).toBeVisible();

  // Barcodes and place names are searchable too.
  await search.fill("4006381333931");
  await expect(page.getByRole("button", { name: "Delete Drill" })).toBeVisible();
  await search.fill("desk");
  await expect(page.getByRole("button", { name: "Delete Ibuprofen" })).toBeVisible();

  await search.fill("nothing matches this");
  await expect(page.getByText("No items match your search")).toBeVisible();
});

test("quick add only offers places from the selected site", async ({ page }) => {
  await signedIn(page);
  await mockInventory(page);
  await page.goto("/");

  const placeSelect = page.getByLabel("Places");
  await expect(placeSelect).toBeDisabled();

  await page.getByLabel("Site").selectOption("1");
  await expect(placeSelect).toBeEnabled();
  await expect(placeSelect.locator("option:not([disabled])")).toHaveText(["Garage"]);

  await page.getByLabel("Site").selectOption("2");
  await expect(placeSelect.locator("option:not([disabled])")).toHaveText(["Desk drawer"]);
});

test("refreshes an expired access token instead of emptying the workspace", async ({ page }) => {
  await signedIn(page);

  let refreshCalls = 0;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/auth/refresh")) {
      refreshCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "fresh-token",
          refresh_token: "fresh-refresh-token",
          token_type: "bearer",
          expires_in: 900,
        }),
      });
      return;
    }

    if (request.headers().authorization !== "Bearer fresh-token") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Could not validate credentials" }),
      });
      return;
    }

    const body = path.endsWith("/sites") ? SITES : path.endsWith("/places") ? PLACES : ITEMS;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Delete Drill" })).toBeVisible();
  expect(refreshCalls).toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("inventory-token")))
    .toBe("fresh-token");
});

test("signs out when the session cannot be refreshed", async ({ page }) => {
  await signedIn(page);
  await page.route("**/api/v1/**", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Could not validate credentials" }),
    });
  });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /know what you have/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("inventory-token"))).toBeNull();
});

test("shows the validation message returned by the API", async ({ page }) => {
  await signedIn(page);
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/inventory-items") && request.method() === "POST") {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          detail: [{ loc: ["body", "quantity"], msg: "Input should be greater than 0" }],
        }),
      });
      return;
    }

    const body = path.endsWith("/sites") ? SITES : path.endsWith("/places") ? PLACES : [];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");

  await page.getByRole("textbox", { name: "Item name" }).fill("Torch");
  await page.getByLabel("Site").selectOption("1");
  await page.getByLabel("Places").selectOption("10");
  await page.getByRole("button", { name: "Add to inventory" }).click();

  // FastAPI sends `detail` as a list; the user must not see "[object Object]".
  await expect(page.getByRole("status")).toContainText("quantity: Input should be greater than 0");
});

test("prefills the item name from a local barcode lookup", async ({ page }) => {
  await signedIn(page);
  let lookupBody: Record<string, unknown> | undefined;

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/barcode/lookup") && request.method() === "POST") {
      lookupBody = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          found: true,
          source: "local",
          product: {
            id: 9,
            name: "Olive oil",
            barcode: "4006381333931",
            default_unit: "bottle",
            category: "equipment",
            source: "user",
          },
          message: "Product found in local catalog",
        }),
      });
      return;
    }

    const body = path.endsWith("/sites") ? SITES : path.endsWith("/places") ? PLACES : ITEMS;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");

  await page.getByLabel("Barcode").fill("4006381333931");
  await page.getByRole("button", { name: "Look up" }).click();

  await expect(page.getByText("Found in your catalog: Olive oil")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Item name" })).toHaveValue("Olive oil");
  await expect(page.getByLabel("Unit")).toHaveValue("bottle");
  await expect(
    page.locator("#quick-add-form").getByRole("button", { name: "Equipment" })
  ).toHaveClass(/active/);
  await expect.poll(() => lookupBody).toEqual({ barcode: "4006381333931", local_only: true });
});

test("saves a new barcode on the item so the local catalog can learn it", async ({ page }) => {
  await signedIn(page);
  let createdItem: Record<string, unknown> | undefined;

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/barcode/lookup") && request.method() === "POST") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          found: false,
          source: "not_found",
          product: null,
          message: "Barcode not found in local catalog",
        }),
      });
      return;
    }

    if (path.endsWith("/inventory-items") && request.method() === "POST") {
      createdItem = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: 3, status: "active", ...createdItem }),
      });
      return;
    }

    const body = path.endsWith("/sites") ? SITES : path.endsWith("/places") ? PLACES : [];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");

  await page.getByLabel("Barcode").fill("5901234123457");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByText("Not in your catalog yet")).toBeVisible();

  await page.getByRole("textbox", { name: "Item name" }).fill("Mustard");
  await page.getByLabel("Site").selectOption("1");
  await page.getByLabel("Places").selectOption("10");
  await page.getByRole("button", { name: "Add to inventory" }).click();

  await expect
    .poll(() => createdItem)
    .toMatchObject({
      display_name: "Mustard",
      barcode: "5901234123457",
    });
  await expect(page.getByRole("status")).toContainText("Item added to your inventory.");
});

test("keeps letters out of the barcode field and explains a short code", async ({ page }) => {
  await signedIn(page);
  await mockInventory(page);
  await page.goto("/");

  const barcode = page.getByLabel("Barcode");
  const lookUp = page.getByRole("button", { name: "Look up" });
  const barcodeBox = await barcode.boundingBox();
  const lookUpBox = await lookUp.boundingBox();
  expect(barcodeBox).toBeTruthy();
  expect(lookUpBox).toBeTruthy();
  expect(lookUpBox?.height).toBe(barcodeBox?.height);
  expect(lookUpBox?.y).toBe(barcodeBox?.y);

  await barcode.fill("12ab34");
  await expect(barcode).toHaveValue("1234");
  await lookUp.click();
  await expect(page.getByText("Enter 6 to 14 digits to look up a barcode.")).toBeVisible();
});

test("removes an inventory item after confirmation", async ({ page }) => {
  await signedIn(page);
  let items = [...ITEMS];
  let deletedId: number | undefined;

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/inventory-items/1") && request.method() === "DELETE") {
      deletedId = 1;
      items = items.filter((item) => item.id !== 1);
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
  await page.goto("/");

  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Drill");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Delete Drill" }).click();

  await expect.poll(() => deletedId).toBe(1);
  await expect(page.getByRole("button", { name: "Delete Drill" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete Ibuprofen" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Item removed from your inventory.");
});

test("keeps the item when delete is cancelled", async ({ page }) => {
  await signedIn(page);
  let deleteCalls = 0;

  await page.route("**/api/v1/**", async (route) => {
    if (route.request().method() === "DELETE") {
      deleteCalls += 1;
      await route.fulfill({ status: 204 });
      return;
    }

    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("/sites") ? SITES : path.endsWith("/places") ? PLACES : ITEMS;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete Ibuprofen" }).click();

  await expect(page.getByRole("button", { name: "Delete Ibuprofen" })).toBeVisible();
  expect(deleteCalls).toBe(0);
});
