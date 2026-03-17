/**
 * Backup script — copies factory.db to backups/factory_YYYY-MM-DD_HH-MM-SS.db
 *
 * Usage:
 *   npm run db:backup
 *
 * To schedule automatically on macOS/Linux, add to crontab:
 *   0 8 * * 1-5 cd /path/to/factory-manager/backend && npm run db:backup
 *   (runs every weekday at 08:00)
 */

const fs   = require("fs");
const path = require("path");

const DB_PATH      = path.join(__dirname, "../data/factory.db");
const BACKUPS_DIR  = path.join(__dirname, "../data/backups");

if (!fs.existsSync(DB_PATH)) {
  console.error("Database not found at", DB_PATH);
  process.exit(1);
}

fs.mkdirSync(BACKUPS_DIR, { recursive: true });

// Timestamp: 2026-03-17_14-30-00
const now   = new Date();
const stamp = now.toISOString().replace("T", "_").replace(/:/g, "-").slice(0, 19);
const dest  = path.join(BACKUPS_DIR, `factory_${stamp}.db`);

fs.copyFileSync(DB_PATH, dest);

console.log(`Backup saved → ${dest}`);

// Keep only the 30 most recent backups to avoid filling disk
const files = fs.readdirSync(BACKUPS_DIR)
  .filter((f) => f.startsWith("factory_") && f.endsWith(".db"))
  .sort();

if (files.length > 30) {
  const toDelete = files.slice(0, files.length - 30);
  toDelete.forEach((f) => {
    fs.unlinkSync(path.join(BACKUPS_DIR, f));
    console.log(`Removed old backup: ${f}`);
  });
}
