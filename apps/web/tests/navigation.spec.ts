import { expect, test, type Page } from "@playwright/test";

async function signedIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("inventory-token", "test-token");
    localStorage.setItem("inventory-refresh-token", "test-refresh-token");
    localStorage.setItem("inventory-language", "en");
  });
  await page.route("**/api/v1/**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: "[]" });
  });
}

test("updates the URL when switching pages", async ({ page }) => {
  await signedIn(page);
  await page.goto("/");

  await expect(page).toHaveURL("/");
  await page.getByRole("link", { name: "Medicines" }).click();
  await expect(page).toHaveURL("/medicines");
  await expect(page.getByRole("heading", { name: "In the cabinet." })).toBeVisible();

  await page.getByRole("link", { name: "Food", exact: true }).click();
  await expect(page).toHaveURL("/foods");
  await expect(page.getByRole("heading", { name: "In the pantry." })).toBeVisible();

  await page.getByRole("link", { name: "Locations" }).click();
  await expect(page).toHaveURL("/locations");
  await expect(page.getByRole("heading", { name: "Your locations." })).toBeVisible();

  await page.getByRole("link", { name: "Inventory" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Everything, in its place." })).toBeVisible();

  await page.getByRole("link", { name: "Items" }).click();
  await expect(page).toHaveURL("/items");
  await expect(page.getByRole("heading", { name: "Create and edit items." })).toBeVisible();
});

test("opens a shared foods URL", async ({ page }) => {
  await signedIn(page);
  await page.goto("/foods");

  await expect(page).toHaveURL("/foods");
  await expect(page.getByRole("heading", { name: "In the pantry." })).toBeVisible();
});

test("opens a shared items URL", async ({ page }) => {
  await signedIn(page);
  await page.goto("/items/new");

  await expect(page).toHaveURL("/items/new");
  await expect(page.getByRole("heading", { name: "New item" })).toBeVisible();
});

test("rewrites unknown paths to inventory", async ({ page }) => {
  await signedIn(page);
  await page.goto("/not-a-page");

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Everything, in its place." })).toBeVisible();
});

test("keeps a shared page after the browser back button", async ({ page }) => {
  await signedIn(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Medicines" }).click();
  await page.getByRole("link", { name: "Locations" }).click();
  await page.goBack();

  await expect(page).toHaveURL("/medicines");
  await expect(page.getByRole("heading", { name: "In the cabinet." })).toBeVisible();
});
