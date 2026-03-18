/**
 * Factory Manager - Express API Server
 *
 * Endpoints:
 *   /api/parts     → parts (raw materials)
 *   /api/products  → products (finished goods + BOM)
 *   /api/orders    → orders + production planning
 */

require("express-async-errors"); // patches Express to forward async errors to error handler
const express = require("express");
const cors = require("cors");

const path = require("path");
const fs   = require("fs");
const dashboardRouter   = require("./routes/dashboard");
const partsRouter       = require("./routes/parts");
const productsRouter    = require("./routes/products");
const ordersRouter      = require("./routes/orders");
const customersRouter   = require("./routes/customers");
const procurementRouter = require("./routes/procurement");
const printRouter       = require("./routes/print");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({ origin: "http://localhost:5173" })); // Vite dev server
app.use(express.json());

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use("/api/dashboard",       dashboardRouter);
app.use("/api/parts",          partsRouter);
app.use("/api/products",       productsRouter);
app.use("/api/orders",         ordersRouter);
app.use("/api/customers",      customersRouter);
app.use("/api",                procurementRouter); // mounts /api/suppliers and /api/purchase-orders
app.use("/api/orders",         printRouter);       // mounts /api/orders/:id/work-order etc.

// ── Health check ───────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// ── Database backup download ───────────────────────────────────────────────────
// Triggers the backup script, then streams the db file to the browser.
app.get("/api/backup/download", (req, res) => {
  const dbPath = path.join(__dirname, "../../data/factory.db");
  if (!fs.existsSync(dbPath)) {
    return res.status(404).json({ error: "Database file not found" });
  }

  // Also save a timestamped copy in the backups folder
  require("child_process").execSync("node scripts/backup.js", {
    cwd: path.join(__dirname, "../.."),
  });

  const stamp    = new Date().toISOString().replace("T", "_").replace(/:/g, "-").slice(0, 19);
  const filename = `factory_${stamp}.db`;

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "application/octet-stream");
  fs.createReadStream(dbPath).pipe(res);
});

// ── Global error handler ───────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.stack ?? err.message);

  // Prisma "record not found"
  if (err.code === "P2025") {
    return res.status(404).json({ error: "Record not found" });
  }
  // Prisma unique constraint
  if (err.code === "P2002") {
    return res.status(409).json({ error: "A record with that name already exists" });
  }

  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`\nFactory Manager API → http://localhost:${PORT}\n`);
});
