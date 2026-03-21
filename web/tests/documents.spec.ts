import { test, expect } from "@playwright/test";

/**
 * Document generation tests — manager session.
 * Verifies work order, delivery note, and invoice pages render correctly
 * for the first available order.
 */

test.describe("Document generation", () => {
  let firstOrderId: number | null = null;
  let firstCompletedId: number | null = null;

  test.beforeAll(async ({ request }) => {
    const res = await request.get("/api/orders");
    const orders = await res.json();
    const nonCancelled = orders.filter((o: any) => o.status !== "cancelled");
    if (nonCancelled.length > 0) firstOrderId = nonCancelled[0].id;
    const completed = orders.filter((o: any) => o.status === "completed");
    if (completed.length > 0) firstCompletedId = completed[0].id;
  });

  test("work order renders with DTS logo and correct heading", async ({ page }) => {
    if (!firstOrderId) test.skip(true, "No non-cancelled orders to test");
    await page.goto(`/api/orders/${firstOrderId}/work-order`);
    await expect(page.locator("body")).toContainText(/work order/i);
    // Logo is present
    const logo = page.locator('img[alt="DTS Solutions"]');
    await expect(logo).toBeVisible();
    // Print button visible
    await expect(page.getByRole("button", { name: /print/i })).toBeVisible();
  });

  test("delivery note renders with DTS logo and correct heading", async ({ page }) => {
    if (!firstOrderId) test.skip(true, "No non-cancelled orders to test");
    await page.goto(`/api/orders/${firstOrderId}/delivery-note`);
    await expect(page.locator("body")).toContainText(/delivery note/i);
    const logo = page.locator('img[alt="DTS Solutions"]');
    await expect(logo).toBeVisible();
    await expect(page.getByRole("button", { name: /print/i })).toBeVisible();
  });

  test("invoice renders with DTS logo and correct heading", async ({ page }) => {
    if (!firstCompletedId) test.skip(true, "No completed orders to test");
    await page.goto(`/api/orders/${firstCompletedId}/invoice`);
    await expect(page.locator("body")).toContainText(/invoice/i);
    const logo = page.locator('img[alt="DTS Solutions"]');
    await expect(logo).toBeVisible();
    await expect(page.getByRole("button", { name: /print/i })).toBeVisible();
  });

  test("work order for non-existent order returns 404", async ({ request }) => {
    const res = await request.get("/api/orders/999999/work-order");
    expect(res.status()).toBe(404);
  });

  test("delivery note for non-existent order returns 404", async ({ request }) => {
    const res = await request.get("/api/orders/999999/delivery-note");
    expect(res.status()).toBe(404);
  });

  test("invoice for non-existent order returns 404", async ({ request }) => {
    const res = await request.get("/api/orders/999999/invoice");
    expect(res.status()).toBe(404);
  });
});
