import { expect, test, type Page } from "@playwright/test";

const SITES = [
  { id: 1, name: "Home" },
  { id: 2, name: "Office" },
];
const PLACES = [
  { id: 10, site_id: 1, name: "Garage" },
  { id: 11, site_id: 1, name: "Kitchen" },
  { id: 20, site_id: 2, name: "Desk drawer" },
];

function medicineItems() {
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
      medicine_details: { expiration_date: "2027-12-31" },
    },
    {
      id: 3,
      display_name: "Cough syrup",
      item_type: "medicine",
      quantity: 1,
      unit: "bottle",
      site_id: 1,
      place_id: 11,
      status: "active",
      medicine_details: { expiration_date: "2020-01-01" },
    },
    {
      id: 4,
      display_name: "Office aspirin",
      item_type: "medicine",
      quantity: 8,
      unit: "tablets",
      site_id: 2,
      place_id: 20,
      status: "active",
      medicine_details: { expiration_date: "2028-06-01" },
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

async function openMedicines(page: Page, items = medicineItems()) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

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

    if (request.method() === "DELETE" && /\/inventory-items\/\d+$/.test(path)) {
      const id = Number(path.split("/").at(-1));
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
  await page.goto("/medicines");
}

test("shows every medicine by default with site/place locations", async ({ page }) => {
  await signedIn(page);
  await openMedicines(page);

  await expect(page.getByRole("heading", { name: "Medicines" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Home/Garage" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Home/Kitchen" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Office/Desk drawer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use 1 Ibuprofen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use 1 Cough syrup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use 1 Office aspirin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use 1 Drill" })).toHaveCount(0);
});

test("filters medicines by location and expired date", async ({ page }) => {
  await signedIn(page);
  await openMedicines(page);

  await page.getByLabel("Location").selectOption({ label: "Home/Kitchen" });
  await expect(page.getByRole("button", { name: "Use 1 Cough syrup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use 1 Ibuprofen" })).toHaveCount(0);

  await page.getByLabel("Location").selectOption({ label: "All locations" });
  await page.getByLabel("Expired only").check();
  await expect(page.getByRole("button", { name: "Use 1 Cough syrup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use 1 Ibuprofen" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use 1 Office aspirin" })).toHaveCount(0);
  await expect(page.getByText("Expired", { exact: true })).toBeVisible();
});

test("using a medicine reduces its quantity by one", async ({ page }) => {
  await signedIn(page);
  await openMedicines(page);

  await expect(page.getByRole("cell", { name: "20 tablets" })).toBeVisible();
  await page.getByRole("button", { name: "Use 1 Ibuprofen" }).click();
  await expect(page.getByRole("status")).toContainText("Used 1 Ibuprofen.");
  await expect(page.getByRole("cell", { name: "19 tablets" })).toBeVisible();
});

test("deletes one medicine from the medicines tab", async ({ page }) => {
  await signedIn(page);
  await openMedicines(page);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Ibuprofen" }).click();

  await expect(page.getByRole("status")).toContainText("Item removed from your inventory.");
  await expect(page.getByRole("button", { name: "Delete Ibuprofen" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete Cough syrup" })).toBeVisible();
});

test("deletes only the medicines in the current filter", async ({ page }) => {
  await signedIn(page);
  await openMedicines(page);

  await page.getByLabel("Expired only").check();
  await expect(page.getByRole("button", { name: "Delete Cough syrup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Ibuprofen" })).toHaveCount(0);

  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("1");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Delete 1 in this view" }).click();

  await expect(page.getByRole("status")).toContainText("Removed 1 medicine");
  await page.getByLabel("Expired only").uncheck();
  await expect(page.getByRole("button", { name: "Delete Cough syrup" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete Ibuprofen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Office aspirin" })).toBeVisible();
});
