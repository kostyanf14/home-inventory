import { expect, test } from "@playwright/test";

test("opens the account form from the welcome screen", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /know what you have/i })).toBeVisible();
  await page.getByRole("button", { name: /start your inventory/i }).click();

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();

  await page.getByRole("button", { name: /need an account/i }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByLabel("Name")).toBeVisible();
});

test("switches the welcome screen to Ukrainian", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "UA" }).click();

  await expect(page.getByRole("heading", { name: /Знайте, що у вас є/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Почати облік/i })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
});

test("translates and clears navigation notices", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("inventory-token", "test-token");
    localStorage.setItem("inventory-refresh-token", "test-refresh-token");
    localStorage.setItem("inventory-language", "en");
  });
  await page.route("**/api/v1/**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: "[]" });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Scan lookup" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Barcode lookup is ready when adding an item.x"
  );

  await page.getByRole("button", { name: "UA" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Пошук за штрихкодом доступний під час додавання речі.x"
  );

  await page.getByRole("button", { name: "Інвентар", exact: true }).click();
  await expect(page.getByRole("status")).toBeHidden();
});

test("adds a site without losing the form element after the API request", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("inventory-token", "test-token");
    localStorage.setItem("inventory-language", "en");
  });
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;
    const body =
      method === "POST" && path.endsWith("/sites") ? { id: 1, name: "Home", type: "home" } : [];

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Locations" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Home");
  await page.getByRole("button", { name: "Add site" }).click();

  await expect(page.getByRole("status")).toHaveText("Site added.x");
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("");
});

test("updates and deletes a site", async ({ page }) => {
  let sites = [{ id: 1, name: "Home", type: "home" }];
  let deleted = false;

  await page.addInitScript(() => {
    localStorage.setItem("inventory-token", "test-token");
    localStorage.setItem("inventory-language", "en");
  });
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/sites/1") && method === "PATCH") {
      const update = request.postDataJSON() as { name: string; type: string | null };
      sites = [{ id: 1, name: update.name, type: update.type ?? undefined }];
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(sites[0]) });
      return;
    }

    if (path.endsWith("/sites/1") && method === "DELETE") {
      sites = [];
      deleted = true;
      await route.fulfill({ status: 204 });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(path.endsWith("/sites") ? sites : []),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Locations" }).click();

  await page.getByRole("button", { name: "Edit location" }).click();
  await page.locator(".location-edit input").first().fill("Flat");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Location updated.x");
  await expect(page.getByText("Flat", { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete location" }).click();
  await expect.poll(() => deleted).toBe(true);
  await expect(page.getByRole("status")).toHaveText("Location deleted.x");
});

test("focuses the quick-add form from the header action", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("inventory-token", "test-token");
    localStorage.setItem("inventory-language", "en");
  });
  await page.route("**/api/v1/**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: "[]" });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByLabel("Barcode")).toBeFocused();
  await expect(page.getByRole("status")).toBeHidden();
});

test("sends optional equipment dates when adding an item", async ({ page }) => {
  let equipmentPayload: Record<string, unknown> | undefined;

  await page.addInitScript(() => {
    localStorage.setItem("inventory-token", "test-token");
    localStorage.setItem("inventory-language", "en");
  });
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/inventory-items") && request.method() === "POST") {
      equipmentPayload = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(equipmentPayload),
      });
      return;
    }

    const response = path.endsWith("/sites")
      ? [{ id: 1, name: "Home" }]
      : path.endsWith("/places")
        ? [{ id: 2, site_id: 1, name: "Garage" }]
        : [];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(response) });
  });
  await page.goto("/");

  await page.locator("#quick-add-form").getByRole("button", { name: "Equipment" }).click();
  await page.getByRole("textbox", { name: "Item name" }).fill("Drill");
  await page.getByLabel("Site").selectOption("1");
  await page.getByLabel("Places").selectOption("2");
  await page.getByLabel("Buy date").fill("2025-01-15");
  await page.getByLabel("Warranty end date").fill("2028-01-15");
  await page.getByRole("button", { name: "Add to inventory" }).click();

  await expect
    .poll(() => equipmentPayload)
    .toMatchObject({
      item_type: "equipment",
      equipment_details: {
        buy_date: "2025-01-15",
        warranty_expiration_date: "2028-01-15",
      },
    });
});

test("shows an equipment warranty end date in the inventory table", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("inventory-token", "test-token");
    localStorage.setItem("inventory-language", "en");
  });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const response = path.endsWith("/inventory-items")
      ? [
          {
            id: 1,
            display_name: "Drill",
            item_type: "equipment",
            quantity: 1,
            unit: "pcs",
            place_id: 2,
            status: "active",
            equipment_details: { warranty_expiration_date: "2026-11-18" },
          },
        ]
      : path.endsWith("/places")
        ? [{ id: 2, site_id: 1, name: "Garage" }]
        : path.endsWith("/sites")
          ? [{ id: 1, name: "Home" }]
          : [];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(response) });
  });
  await page.goto("/");

  await expect(page.getByText("Warranty ends 2026-11-18")).toBeVisible();
});
