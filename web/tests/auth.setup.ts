import { test as setup } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, ".auth/manager.json");

setup("authenticate as manager", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(process.env.TEST_MANAGER_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.TEST_MANAGER_PASSWORD!);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("/dashboard", { timeout: 15000 });
  await page.context().storageState({ path: authFile });
});
