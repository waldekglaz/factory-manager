import { defineConfig, devices } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env.test") });

export default defineConfig({
  globalSetup: "./tests/global-setup.ts",
  testDir: "./tests",
  fullyParallel: false,   // run serially — tests share auth state
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    // Setup projects — create saved auth states
    { name: "setup-manager", testMatch: "**/auth.setup.ts", use: { ...devices["Desktop Chrome"] } },
    { name: "setup-admin",   testMatch: "**/auth-admin.setup.ts", use: { ...devices["Desktop Chrome"] } },

    // Main test project — runs after setup
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/.auth/manager.json",
      },
      dependencies: ["setup-manager"],
      testIgnore: ["**/auth.setup.ts", "**/auth-admin.setup.ts", "**/role-admin.spec.ts"],
    },
    {
      name: "chromium-admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/.auth/admin.json",
      },
      dependencies: ["setup-admin"],
      testMatch: "**/role-admin.spec.ts",
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
