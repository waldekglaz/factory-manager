/**
 * Products Routes
 * CRUD for finished goods + their Bill of Materials (BOM).
 *
 * GET    /api/products          → list all products (with BOM)
 * POST   /api/products          → create product + BOM
 * GET    /api/products/:id      → single product detail
 * PUT    /api/products/:id      → update product + replace BOM
 * DELETE /api/products/:id      → delete product
 */

const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

// ── List all products ─────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      productParts: { include: { part: true } },
      locationStocks: {
        where:   { quantity: { gt: 0 } },
        include: { location: { select: { id: true, name: true, code: true } } },
        orderBy: { quantity: "desc" },
      },
    },
  });
  res.json(products);
});

// ── Single product ────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      productParts: { include: { part: true } },
      orders: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(product);
});

// ── Create product + BOM ──────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { name, dailyCapacity, description, finishedStock, parts, locationStocks } = req.body;
  // parts = [{ partId, materialQty, productsPerBatch, scrapFactor }, ...]

  if (!name || dailyCapacity == null) {
    return res.status(400).json({ error: "name and dailyCapacity are required" });
  }
  if (!parts || parts.length === 0) {
    return res.status(400).json({ error: "At least one part is required in BOM" });
  }

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        name:          name.trim(),
        dailyCapacity: Number(dailyCapacity),
        description:   description ?? "",
        finishedStock: Number(finishedStock ?? 0),
        productParts: {
          create: parts.map((p) => ({
            partId:           Number(p.partId),
            materialQty:      Number(p.materialQty),
            productsPerBatch: Number(p.productsPerBatch),
            scrapFactor:      Number(p.scrapFactor ?? 0),
          })),
        },
      },
    });

    if (locationStocks && locationStocks.length > 0) {
      await tx.productLocationStock.createMany({
        data: locationStocks
          .filter((ls) => Number(ls.quantity) > 0)
          .map((ls) => ({
            productId:  created.id,
            locationId: Number(ls.locationId),
            quantity:   Number(ls.quantity),
          })),
      });
    }

    return tx.product.findUnique({
      where:   { id: created.id },
      include: { productParts: { include: { part: true } }, locationStocks: { include: { location: { select: { id: true, name: true, code: true } } } } },
    });
  });

  res.status(201).json(product);
});

// ── Update product + replace BOM ──────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, dailyCapacity, description, finishedStock, parts, locationStocks } = req.body;

  // Use a transaction so BOM replacement is atomic
  const product = await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: {
        ...(name          != null && { name: name.trim() }),
        ...(dailyCapacity != null && { dailyCapacity: Number(dailyCapacity) }),
        ...(description   != null && { description }),
        ...(finishedStock != null && { finishedStock: Number(finishedStock) }),
      },
    });

    // If parts array provided, replace the entire BOM
    if (parts) {
      await tx.productPart.deleteMany({ where: { productId: id } });
      await tx.productPart.createMany({
        data: parts.map((p) => ({
          productId:        id,
          partId:           Number(p.partId),
          materialQty:      Number(p.materialQty),
          productsPerBatch: Number(p.productsPerBatch),
          scrapFactor:      Number(p.scrapFactor ?? 0),
        })),
      });
    }

    // If locationStocks provided, replace all location assignments
    if (locationStocks !== undefined) {
      await tx.productLocationStock.deleteMany({ where: { productId: id } });
      const rows = locationStocks.filter((ls) => Number(ls.quantity) > 0);
      if (rows.length > 0) {
        await tx.productLocationStock.createMany({
          data: rows.map((ls) => ({
            productId:  id,
            locationId: Number(ls.locationId),
            quantity:   Number(ls.quantity),
          })),
        });
      }
    }

    return tx.product.findUnique({
      where:   { id },
      include: {
        productParts:  { include: { part: true } },
        locationStocks: { include: { location: { select: { id: true, name: true, code: true } } } },
      },
    });
  });

  res.json(product);
});

// ── Delete product ────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);

  // Only block deletion if there are active (non-cancelled) orders
  const activeOrderCount = await prisma.order.count({
    where: { productId: id, status: { not: "cancelled" } },
  });
  if (activeOrderCount > 0) {
    return res.status(409).json({
      error: `Product has ${activeOrderCount} active order(s). Cancel them first.`,
    });
  }

  // Delete cancelled orders (and their orderParts via cascade) before deleting the product,
  // otherwise SQLite's foreign key constraint blocks the product deletion.
  await prisma.$transaction(async (tx) => {
    const cancelledOrders = await tx.order.findMany({
      where: { productId: id, status: "cancelled" },
      select: { id: true },
    });
    if (cancelledOrders.length > 0) {
      const orderIds = cancelledOrders.map((o) => o.id);
      await tx.orderPart.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    await tx.product.delete({ where: { id } });
  });

  res.json({ message: "Product deleted" });
});

module.exports = router;
