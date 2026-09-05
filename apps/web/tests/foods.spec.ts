import { expect, test } from "@playwright/test";

const SITES = [{ id: 1, name: "Home" }];
const PLACES = [
  { id: 10, site_id: 1, name: "Pantry" },
  { id: 11, site_id: 1, name: "Fridge" },
];

function pantryItems() {
  return [
    {
      id: 1,
      display_name: "Ibuprofen",
      item_type: "medicine",
      quantity: 20,
      unit: "tablets",
      site_id: 1,
      place_id: 10,
      status: "active",
      medicine_details: { expiration_date: "2027-12-31" },
    },
    {
      id: 2,
      display_name: "Tomato soup",
      item_type: "food",
      quantity: 4,
      unit: "cans",
      site_id: 1,
      place_id: 10,
      status: "active",
      food_details: { expiration_date: "2028-06-01" },
    },
    {
      id: 3,
      display_name: "Beans",
      item_type: "food",
      quantity: 1,
      unit: "cans",
      site_id: 1,
      place_id: 11,
      status: "active",
      food_details: { expiration_date: "2020-01-01" },
    },
  ];
}

async function openFoods(page: Page, items = pantryItems()) {
  await page.addInitScript(() => {
    localStorage.setItem("inventory-token", "test-token");
    localStorage.setItem("inventory-refresh-token", "test-refresh-token");
    localStorage.setItem("inventory-language", "en");
  });
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/use") && request.method() === "POST") {
      const id = Number(path.split("/").at(-2));
      const current = items.find((item) => item.id === id);
      if (!current) {
        await route.fulfill({ status: 404, body: "{}" });
        return;
      }
      current.quantity -= 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(current),
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
  await page.goto("/foods");
}

test("shows food with Use 1 and hides medicines", async ({ page }) => {
  await openFoods(page);

  await expect(page.getByRole("heading", { name: "Food", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use 1 Tomato soup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use 1 Beans" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use 1 Ibuprofen" })).toHaveCount(0);
});

test("using food reduces its quantity by one", async ({ page }) => {
  await openFoods(page);

  await expect(page.getByRole("cell", { name: "4 cans" })).toBeVisible();
  await page.getByRole("button", { name: "Use 1 Tomato soup" }).click();
  await expect(page.getByRole("status")).toContainText("Used 1 Tomato soup.");
  await expect(page.getByRole("cell", { name: "3 cans" })).toBeVisible();
});
