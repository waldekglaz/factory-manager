const { defineConfig } = require("@prisma/config");
const fs = require("fs");
const path = require("path");

// Prisma config skips .env* loading — load .env.local manually
const envFile = path.resolve(__dirname, ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (/^["']/.test(val)) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

module.exports = defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url:       process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL,
  },
});
