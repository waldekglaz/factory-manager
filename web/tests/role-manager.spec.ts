import { test, expect } from "@playwright/test";

/**
 * Role tests — manager session.
 * Verifies manager can access all pages and sees all action buttons.
 */

test.describe("Manager role", () => {
  test("sidebar shows all nav links including restricted ones", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator(".sidebar-nav")).toContainText("Materials / Parts");
    await expect(page.locator(".sidebar-nav")).toContainText("Products");
    await expect(page.locator(".sidebar-nav")).toContainText("Locations");
    await expect(page.locator(".sidebar-nav")).toContainText("Production Schedule");
    await expect(page.locator(".sidebar-nav")).toContainText("Users");
  });

  test("manager can access /parts", async ({ page }) => {
    await page.goto("/parts");
    await expect(page).not.toHaveURL(/\/dashboard|\/login/);
    await expect(page.locator(".page-title")).toBeVisible();
  });

  test("manager can access /products", async ({ page }) => {
    await page.goto("/products");
    await expect(page).not.toHaveURL(/\/dashboard|\/login/);
  });

  test("manager can access /locations", async ({ page }) => {
    await page.goto("/locations");
    await expect(page).not.toHaveURL(/\/dashboard|\/login/);
  });

  test("manager can access /schedule", async ({ page }) => {
    await page.goto("/schedule");
    await expect(page).not.toHaveURL(/\/dashboard|\/login/);
  });

  test("manager sees 'Place Order' button on orders page", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.getByRole("button", { name: /place order/i })).toBeVisible();
  });

  test("manager sees New Customer button", async ({ page }) => {
    await page.goto("/customers");
    await expect(page.getByRole("button", { name: /new customer/i })).toBeVisible();
  });

  test("manager sees New Purchase Order button in procurement", async ({ page }) => {
    await page.goto("/procurement");
    await expect(page.getByRole("button", { name: /new purchase order/i })).toBeVisible();
  });

  test("manager sees Suppliers tab in procurement", async ({ page }) => {
    await page.goto("/procurement");
    await expect(page.getByRole("button", { name: /suppliers/i })).toBeVisible();
  });
});
