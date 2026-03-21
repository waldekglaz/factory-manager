import { test as setup } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, ".auth/admin.json");

setup("authenticate as admin", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD!);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("/dashboard", { timeout: 15000 });
  await page.context().storageState({ path: authFile });
});
