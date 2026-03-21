import { test, expect } from "@playwright/test";

/**
 * Smoke tests — every main page loads without crashing (manager session).
 * Checks for the page title heading and absence of error alerts.
 */

const PAGES = [
  { path: "/dashboard",   selector: ".page-title", title: /dashboard/i },
  { path: "/parts",       selector: ".page-title", title: /materials|parts/i },
  { path: "/products",    selector: ".page-title", title: /products/i },
  { path: "/locations",   selector: "h1",          title: /locations/i },
  { path: "/customers",   selector: ".page-title", title: /customers/i },
  { path: "/orders",      selector: ".page-title", title: /orders/i },
  { path: "/procurement", selector: ".page-title", title: /procurement/i },
  { path: "/schedule",    selector: ".page-title", title: /schedule/i },
  { path: "/users",       selector: ".page-title", title: /users/i },
];

for (const { path, selector, title } of PAGES) {
  test(`${path} loads without error`, async ({ page }) => {
    await page.goto(path, { timeout: 30000 });
    // Should stay on the page (not redirect to login)
    await expect(page).not.toHaveURL(/\/login/);
    // Page title heading should be visible
    await expect(page.locator(selector).first()).toHaveText(title, { timeout: 20000 });
    // No unhandled error alerts on load
    await expect(page.locator(".alert-error")).toHaveCount(0);
  });
}
