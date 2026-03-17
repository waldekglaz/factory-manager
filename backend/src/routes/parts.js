/**
 * Parts Routes
 * CRUD for raw materials / components.
 *
 * GET    /api/parts          → list all parts
 * POST   /api/parts          → create a part
 * PUT    /api/parts/:id      → update a part (stock, lead time, etc.)
 * DELETE /api/parts/:id      → delete a part (only if not used in any product)
 * GET    /api/parts/:id/movements  → stock movement history for a part
 */

const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

// ── List all parts ────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const parts = await prisma.part.findMany({
    orderBy: { name: "asc" },
    include: {
      // Include how many products use this part
      _count: { select: { productParts: true } },
    },
  });
  res.json(parts);
});

// ── Create a part ─────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { name, currentStock, minimumStock, supplierLeadTime, unit } = req.body;

  if (!name || supplierLeadTime == null) {
    return res.status(400).json({ error: "name and supplierLeadTime are required" });
  }

  const part = await prisma.part.create({
    data: {
      name: name.trim(),
      currentStock: currentStock != null ? Number(currentStock) : 0,
      minimumStock: minimumStock != null && minimumStock !== "" ? Number(minimumStock) : null,
      supplierLeadTime: Number(supplierLeadTime),
      unit: unit ?? "pcs",
    },
  });

  res.status(201).json(part);
});

// ── Update a part ─────────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, currentStock, minimumStock, supplierLeadTime, unit } = req.body;

  const part = await prisma.part.update({
    where: { id },
    data: {
      ...(name != null && { name: name.trim() }),
      ...(currentStock != null && { currentStock: Number(currentStock) }),
      ...(minimumStock !== undefined && { minimumStock: minimumStock !== "" ? Number(minimumStock) : null }),
      ...(supplierLeadTime != null && { supplierLeadTime: Number(supplierLeadTime) }),
      ...(unit != null && { unit }),
    },
  });

  res.json(part);
});

// ── Delete a part ─────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);

  // Prevent deletion if the part is used in any product BOM
  const usageCount = await prisma.productPart.count({ where: { partId: id } });
  if (usageCount > 0) {
    return res.status(409).json({
      error: `Part is used in ${usageCount} product(s). Remove from BOM first.`,
    });
  }

  // Delete stock movements first (they reference this part but are just history)
  await prisma.stockMovement.deleteMany({ where: { partId: id } });
  await prisma.part.delete({ where: { id } });
  res.json({ message: "Part deleted" });
});

// ── Stock movement history ────────────────────────────────────────────────────
router.get("/:id/movements", async (req, res) => {
  const partId = Number(req.params.id);
  const movements = await prisma.stockMovement.findMany({
    where: { partId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(movements);
});

module.exports = router;
