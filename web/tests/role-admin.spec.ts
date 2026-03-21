import { test, expect } from "@playwright/test";

/**
 * Role tests — admin session.
 * Verifies admin is blocked from restricted pages and action buttons are hidden.
 */

test.describe("Admin role", () => {
  test("sidebar does NOT show restricted nav links", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator(".sidebar-nav")).not.toContainText("Materials / Parts");
    await expect(page.locator(".sidebar-nav")).not.toContainText("Products");
    await expect(page.locator(".sidebar-nav")).not.toContainText("Locations");
    await expect(page.locator(".sidebar-nav")).not.toContainText("Production Schedule");
    await expect(page.locator(".sidebar-nav")).not.toContainText("Users");
  });

  test("sidebar shows permitted nav links", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator(".sidebar-nav")).toContainText("Dashboard");
    await expect(page.locator(".sidebar-nav")).toContainText("Customers");
    await expect(page.locator(".sidebar-nav")).toContainText("Orders");
    await expect(page.locator(".sidebar-nav")).toContainText("Procurement");
  });

  test("admin navigating to /parts is redirected to /dashboard", async ({ page }) => {
    await page.goto("/parts");
    await expect(page).toHaveURL("/dashboard", { timeout: 10000 });
  });

  test("admin navigating to /products is redirected to /dashboard", async ({ page }) => {
    await page.goto("/products");
    await expect(page).toHaveURL("/dashboard", { timeout: 10000 });
  });

  test("admin navigating to /locations is redirected to /dashboard", async ({ page }) => {
    await page.goto("/locations");
    await expect(page).toHaveURL("/dashboard", { timeout: 10000 });
  });

  test("admin navigating to /schedule is redirected to /dashboard", async ({ page }) => {
    await page.goto("/schedule");
    await expect(page).toHaveURL("/dashboard", { timeout: 10000 });
  });

  test("admin navigating to /users is redirected to /dashboard", async ({ page }) => {
    await page.goto("/users");
    await expect(page).toHaveURL("/dashboard", { timeout: 10000 });
  });

  test("admin does NOT see Place Order button", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.getByRole("button", { name: /place order/i })).toHaveCount(0);
  });

  test("admin does NOT see Start/Complete/Cancel order buttons", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.getByRole("button", { name: /^start$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^complete$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^cancel$/i })).toHaveCount(0);
  });

  test("admin does NOT see New Customer button", async ({ page }) => {
    await page.goto("/customers");
    await expect(page.getByRole("button", { name: /new customer/i })).toHaveCount(0);
  });

  test("admin does NOT see Edit/Delete buttons on customers", async ({ page }) => {
    await page.goto("/customers");
    await expect(page.getByRole("button", { name: /^edit$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^delete$/i })).toHaveCount(0);
  });

  test("admin does NOT see New Purchase Order button", async ({ page }) => {
    await page.goto("/procurement");
    await expect(page.getByRole("button", { name: /new purchase order/i })).toHaveCount(0);
  });

  test("admin does NOT see Suppliers tab in procurement", async ({ page }) => {
    await page.goto("/procurement");
    await expect(page.getByRole("button", { name: /^suppliers$/i })).toHaveCount(0);
  });
});
