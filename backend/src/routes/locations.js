/**
 * Locations Routes — Storage Location Management
 *
 * GET    /api/locations             → list all locations with stock summary
 * POST   /api/locations             → create location
 * PUT    /api/locations/:id         → update location
 * DELETE /api/locations/:id         → delete (only if empty)
 * GET    /api/locations/:id/stock   → full stock breakdown for one location
 *
 * POST   /api/locations/transfer/parts    → move part stock between locations
 * POST   /api/locations/transfer/products → move finished goods between locations
 */

const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma  = new PrismaClient();

// ── List all locations ────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const locations = await prisma.location.findMany({
    orderBy: { name: "asc" },
    include: {
      // Count distinct parts and products stored here
      _count: {
        select: {
          partStocks:    true,
          productStocks: true,
        },
      },
      // Sum of all part quantities in this location
      partStocks:    { select: { quantity: true } },
      productStocks: { select: { quantity: true } },
    },
  });

  // Attach total unit counts for the summary card
  const result = locations.map((loc) => ({
    ...loc,
    totalPartUnits:    loc.partStocks.reduce((s, r) => s + r.quantity, 0),
    totalProductUnits: loc.productStocks.reduce((s, r) => s + r.quantity, 0),
    // Remove raw arrays (they're big and we have the totals)
    partStocks:    undefined,
    productStocks: undefined,
  }));

  res.json(result);
});

// ── Single location — full stock breakdown ────────────────────────────────────
router.get("/:id/stock", async (req, res) => {
  const id = Number(req.params.id);

  const location = await prisma.location.findUnique({
    where: { id },
    include: {
      partStocks: {
        where:   { quantity: { gt: 0 } },
        include: { part: true },
        orderBy: { part: { name: "asc" } },
      },
      productStocks: {
        where:   { quantity: { gt: 0 } },
        include: { product: true },
        orderBy: { product: { name: "asc" } },
      },
    },
  });

  if (!location) return res.status(404).json({ error: "Location not found" });
  res.json(location);
});

// ── Create location ───────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { name, code, description, isRemote, deliveryDays } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const location = await prisma.location.create({
    data: {
      name:        name.trim(),
      code:        code        ? code.trim()        : null,
      description: description ? description.trim() : "",
      isRemote:    isRemote    ? Boolean(isRemote)  : false,
      deliveryDays: isRemote && deliveryDays != null ? Number(deliveryDays) : null,
    },
  });
  res.status(201).json(location);
});

// ── Update location ───────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, code, description, isActive, isRemote, deliveryDays } = req.body;

  const location = await prisma.location.update({
    where: { id },
    data: {
      ...(name        != null     && { name:        name.trim() }),
      ...(code        !== undefined && { code:      code ? code.trim() : null }),
      ...(description != null     && { description }),
      ...(isActive    != null     && { isActive }),
      ...(isRemote    != null     && { isRemote:    Boolean(isRemote) }),
      ...(deliveryDays !== undefined && {
        deliveryDays: deliveryDays != null ? Number(deliveryDays) : null,
      }),
    },
  });
  res.json(location);
});

// ── Delete location ───────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);

  // Cannot delete if there is still stock assigned to this location
  const partStock = await prisma.partLocationStock.aggregate({
    where:  { locationId: id },
    _sum:   { quantity: true },
  });
  const productStock = await prisma.productLocationStock.aggregate({
    where:  { locationId: id },
    _sum:   { quantity: true },
  });

  const totalStock = (partStock._sum.quantity ?? 0) + (productStock._sum.quantity ?? 0);
  if (totalStock > 0) {
    return res.status(409).json({
      error: `Location still holds ${totalStock} unit(s). Transfer or remove all stock first.`,
    });
  }

  await prisma.location.delete({ where: { id } });
  res.json({ message: "Location deleted" });
});

// ── Transfer part stock between locations ─────────────────────────────────────
// POST /api/locations/transfer/parts
// Body: { partId, fromLocationId, toLocationId, quantity }
router.post("/transfer/parts", async (req, res) => {
  const { partId, fromLocationId, toLocationId, quantity } = req.body;
  const qty = Number(quantity);

  if (!partId || !fromLocationId || !toLocationId || !qty || qty <= 0) {
    return res.status(400).json({ error: "partId, fromLocationId, toLocationId, and quantity are required" });
  }
  if (Number(fromLocationId) === Number(toLocationId)) {
    return res.status(400).json({ error: "Source and destination locations must be different" });
  }

  const result = await prisma.$transaction(async (tx) => {
    // Check source has enough
    const source = await tx.partLocationStock.findUnique({
      where: { partId_locationId: { partId: Number(partId), locationId: Number(fromLocationId) } },
    });
    if (!source || source.quantity < qty) {
      throw new Error(`Not enough stock in source location (has ${source?.quantity ?? 0}, need ${qty})`);
    }

    // Deduct from source
    await tx.partLocationStock.update({
      where: { partId_locationId: { partId: Number(partId), locationId: Number(fromLocationId) } },
      data:  { quantity: { decrement: qty } },
    });

    // Add to destination (upsert in case no record exists yet)
    await tx.partLocationStock.upsert({
      where:  { partId_locationId: { partId: Number(partId), locationId: Number(toLocationId) } },
      update: { quantity: { increment: qty } },
      create: { partId: Number(partId), locationId: Number(toLocationId), quantity: qty },
    });

    // Log the transfer in stock movements (two entries: out + in)
    await tx.stockMovement.createMany({
      data: [
        { partId: Number(partId), locationId: Number(fromLocationId), quantity: -qty, reason: `transferred_to_location_#${toLocationId}` },
        { partId: Number(partId), locationId: Number(toLocationId),   quantity:  qty, reason: `transferred_from_location_#${fromLocationId}` },
      ],
    });

    // Return fresh stock for both locations
    return tx.partLocationStock.findMany({
      where:   { partId: Number(partId) },
      include: { location: true },
    });
  });

  res.json(result);
});

// ── Transfer finished goods between locations ─────────────────────────────────
// POST /api/locations/transfer/products
// Body: { productId, fromLocationId, toLocationId, quantity }
router.post("/transfer/products", async (req, res) => {
  const { productId, fromLocationId, toLocationId, quantity } = req.body;
  const qty = Number(quantity);

  if (!productId || !fromLocationId || !toLocationId || !qty || qty <= 0) {
    return res.status(400).json({ error: "productId, fromLocationId, toLocationId, and quantity are required" });
  }
  if (Number(fromLocationId) === Number(toLocationId)) {
    return res.status(400).json({ error: "Source and destination must be different" });
  }

  const result = await prisma.$transaction(async (tx) => {
    const source = await tx.productLocationStock.findUnique({
      where: { productId_locationId: { productId: Number(productId), locationId: Number(fromLocationId) } },
    });
    if (!source || source.quantity < qty) {
      throw new Error(`Not enough stock in source location (has ${source?.quantity ?? 0}, need ${qty})`);
    }

    await tx.productLocationStock.update({
      where: { productId_locationId: { productId: Number(productId), locationId: Number(fromLocationId) } },
      data:  { quantity: { decrement: qty } },
    });

    await tx.productLocationStock.upsert({
      where:  { productId_locationId: { productId: Number(productId), locationId: Number(toLocationId) } },
      update: { quantity: { increment: qty } },
      create: { productId: Number(productId), locationId: Number(toLocationId), quantity: qty },
    });

    await tx.finishedGoodsMovement.createMany({
      data: [
        { productId: Number(productId), locationId: Number(fromLocationId), quantity: -qty, reason: `transferred_to_location_#${toLocationId}` },
        { productId: Number(productId), locationId: Number(toLocationId),   quantity:  qty, reason: `transferred_from_location_#${fromLocationId}` },
      ],
    });

    return tx.productLocationStock.findMany({
      where:   { productId: Number(productId) },
      include: { location: true },
    });
  });

  res.json(result);
});

module.exports = router;
