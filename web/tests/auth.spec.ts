import { test, expect } from "@playwright/test";

/**
 * Auth tests — run without saved session (unauthenticated context)
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Authentication", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("unauthenticated user is redirected to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated user cannot access /orders", async ({ page }) => {
    await page.goto("/orders");
    await expect(page).toHaveURL(/\/login/);
  });

  test("invalid credentials shows an error", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("wrong@example.com");
    await page.locator('input[type="password"]').fill("wrongpassword");
    await page.locator('button[type="submit"]').click();
    // Should stay on login and show an error
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(/invalid|incorrect|error/i);
  });

  test("valid manager login redirects to /dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(process.env.TEST_MANAGER_EMAIL!);
    await page.locator('input[type="password"]').fill(process.env.TEST_MANAGER_PASSWORD!);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL("/dashboard", { timeout: 15000 });
  });
});
