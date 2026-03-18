/**
 * Orders Routes
 *
 * Stock allocation model:
 *   - On ORDER CREATION  → available raw-material stock deducted; finished goods stock deducted (fulfilledFromStock)
 *   - On START           → status change only (stock already allocated)
 *   - On CANCEL          → raw-material stock returned; finished goods stock returned
 *   - On RECALCULATE     → undo old allocation → re-plan → re-allocate
 *   - On COMPLETE        → status change; finished goods stock incremented by productionQty
 *
 * "currentStock" on a Part always reflects UNALLOCATED raw-material stock.
 * "finishedStock" on a Product always reflects UNALLOCATED finished units.
 */

const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { calculateProductionPlan } = require("../services/productionPlanner");

const router = express.Router();
const prisma  = new PrismaClient();

// ── Include spec used when loading a product for planning ────────────────────
// Includes supplierParts so the planner can pick the shortest lead time.
const PRODUCT_WITH_BOM = {
  productParts: {
    include: {
      part: {
        include: {
          supplierParts:  { include: { supplier: true } },
          locationStocks: { include: { location: true } },
        },
      },
    },
  },
};

// ── Shared helper: deduct allocated quantities from raw-material stock ────────
async function allocateStock(tx, orderId, partsBreakdown) {
  for (const p of partsBreakdown) {
    if (p.quantityInStock <= 0) continue;
    await tx.part.update({
      where: { id: p.partId },
      data:  { currentStock: { decrement: p.quantityInStock } },
    });
    await tx.stockMovement.create({
      data: {
        partId:   p.partId,
        quantity: -p.quantityInStock,
        reason:   `allocated_to_order_#${orderId}`,
      },
    });
  }
}

// ── Shared helper: return allocated quantities back to raw-material stock ─────
async function deallocateStock(tx, orderId, orderParts) {
  for (const op of orderParts) {
    if (op.quantityInStock <= 0) continue;
    await tx.part.update({
      where: { id: op.partId },
      data:  { currentStock: { increment: op.quantityInStock } },
    });
    await tx.stockMovement.create({
      data: {
        partId:   op.partId,
        quantity: op.quantityInStock,
        reason:   `deallocated_from_order_#${orderId}`,
      },
    });
  }
}

// ── Shared helper: reserve finished goods for an order ───────────────────────
async function reserveFinishedGoods(tx, orderId, productId, qty) {
  if (qty <= 0) return;
  await tx.product.update({
    where: { id: productId },
    data:  { finishedStock: { decrement: qty } },
  });
  await tx.finishedGoodsMovement.create({
    data: { productId, quantity: -qty, reason: `reserved_for_order_#${orderId}` },
  });
}

// ── Shared helper: return reserved finished goods ────────────────────────────
async function returnFinishedGoods(tx, orderId, productId, qty) {
  if (qty <= 0) return;
  await tx.product.update({
    where: { id: productId },
    data:  { finishedStock: { increment: qty } },
  });
  await tx.finishedGoodsMovement.create({
    data: { productId, quantity: qty, reason: `returned_from_order_#${orderId}` },
  });
}

// ── List all orders ───────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      product:  true,
      customer: true,
      orderParts: { include: { part: true } },
    },
  });
  res.json(orders);
});

// ── Single order detail ───────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const id    = Number(req.params.id);
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      product:    { include: PRODUCT_WITH_BOM },
      customer:   true,
      orderParts: { include: { part: true } },
    },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

// ── Place a new order ─────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { productId, customerId, quantity, desiredDeadline, notes } = req.body;

  if (!productId || !quantity) {
    return res.status(400).json({ error: "productId and quantity are required" });
  }

  const product = await prisma.product.findUnique({
    where:   { id: Number(productId) },
    include: PRODUCT_WITH_BOM,
  });
  if (!product) return res.status(404).json({ error: "Product not found" });

  const plan = calculateProductionPlan(
    product,
    Number(quantity),
    desiredDeadline ? new Date(desiredDeadline) : null
  );

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        productId:          product.id,
        customerId:         customerId ? Number(customerId) : null,
        quantity:           Number(quantity),
        desiredDeadline:    desiredDeadline ? new Date(desiredDeadline) : null,
        productionStartDate: plan.productionStartDate,
        productionEndDate:   plan.productionEndDate,
        isOnTime:            plan.isOnTime,
        fulfilledFromStock:  plan.fulfilledFromStock,
        notes:               notes ?? "",
        orderParts: {
          create: plan.partsBreakdown.map((p) => ({
            partId:          p.partId,
            quantityNeeded:  p.quantityNeeded,
            quantityInStock: p.quantityInStock,
            quantityMissing: p.quantityMissing,
            availableDate:   p.availableDate,
          })),
        },
      },
    });

    // Deduct raw material stock for the production portion
    await allocateStock(tx, created.id, plan.partsBreakdown);

    // Reserve finished goods for the stock-fulfilled portion
    await reserveFinishedGoods(tx, created.id, product.id, plan.fulfilledFromStock);

    return tx.order.findUnique({
      where:   { id: created.id },
      include: { product: true, customer: true, orderParts: { include: { part: true } } },
    });
  });

  res.status(201).json(order);
});

// ── Recalculate production plan ───────────────────────────────────────────────
router.post("/:id/recalculate", async (req, res) => {
  const id    = Number(req.params.id);
  const order = await prisma.order.findUnique({
    where:   { id },
    include: {
      orderParts: true,
      product:    { include: PRODUCT_WITH_BOM },
    },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status !== "planned") {
    return res.status(409).json({ error: `Cannot recalculate a ${order.status} order` });
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Return raw-material allocation
    await deallocateStock(tx, id, order.orderParts);
    // Return finished goods reservation
    await returnFinishedGoods(tx, id, order.productId, order.fulfilledFromStock);

    // Re-load product with fresh stock levels
    const freshProduct = await tx.product.findUnique({
      where:   { id: order.productId },
      include: PRODUCT_WITH_BOM,
    });

    const plan = calculateProductionPlan(
      freshProduct,
      order.quantity,
      order.desiredDeadline ? new Date(order.desiredDeadline) : null
    );

    // Replace order-parts snapshot
    await tx.orderPart.deleteMany({ where: { orderId: id } });
    await tx.orderPart.createMany({
      data: plan.partsBreakdown.map((p) => ({
        orderId:         id,
        partId:          p.partId,
        quantityNeeded:  p.quantityNeeded,
        quantityInStock: p.quantityInStock,
        quantityMissing: p.quantityMissing,
        availableDate:   p.availableDate,
      })),
    });

    await allocateStock(tx, id, plan.partsBreakdown);
    await reserveFinishedGoods(tx, id, order.productId, plan.fulfilledFromStock);

    await tx.order.update({
      where: { id },
      data: {
        productionStartDate: plan.productionStartDate,
        productionEndDate:   plan.productionEndDate,
        isOnTime:            plan.isOnTime,
        fulfilledFromStock:  plan.fulfilledFromStock,
      },
    });

    return tx.order.findUnique({
      where:   { id },
      include: { product: true, customer: true, orderParts: { include: { part: true } } },
    });
  });

  res.json(updated);
});

// ── Start production ──────────────────────────────────────────────────────────
router.post("/:id/start", async (req, res) => {
  const id    = Number(req.params.id);
  const order = await prisma.order.findUnique({ where: { id }, include: { orderParts: true } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status !== "planned") {
    return res.status(409).json({ error: `Order is already ${order.status}` });
  }

  const stillMissing = order.orderParts.filter((op) => op.quantityMissing > 0);
  if (stillMissing.length > 0) {
    return res.status(409).json({
      error: "Cannot start — some materials have not arrived yet. Recalculate first after updating stock.",
      missing: stillMissing.map((op) => ({ partId: op.partId, qty: op.quantityMissing })),
    });
  }

  const updated = await prisma.order.update({
    where:   { id },
    data:    { status: "in_production" },
    include: { product: true, customer: true, orderParts: { include: { part: true } } },
  });
  res.json(updated);
});

// ── Complete order ────────────────────────────────────────────────────────────
// Marks as completed and adds the newly-produced units to finished goods stock.
router.post("/:id/complete", async (req, res) => {
  const id    = Number(req.params.id);
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status !== "in_production") {
    return res.status(409).json({
      error: `Order must be in_production to complete (currently: ${order.status})`,
    });
  }

  // Only the produced portion goes to finished goods (the "from stock" portion was already reserved)
  const productionQty = order.quantity - order.fulfilledFromStock;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data: { status: "completed" } });

    if (productionQty > 0) {
      await tx.product.update({
        where: { id: order.productId },
        data:  { finishedStock: { increment: productionQty } },
      });
      await tx.finishedGoodsMovement.create({
        data: {
          productId: order.productId,
          quantity:  productionQty,
          reason:    `order_#${id}_completed`,
        },
      });
    }

    return tx.order.findUnique({
      where:   { id },
      include: { product: true, customer: true, orderParts: { include: { part: true } } },
    });
  });

  res.json(updated);
});

// ── Cancel order ──────────────────────────────────────────────────────────────
router.post("/:id/cancel", async (req, res) => {
  const id    = Number(req.params.id);
  const order = await prisma.order.findUnique({ where: { id }, include: { orderParts: true } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status === "completed") {
    return res.status(409).json({ error: "Cannot cancel a completed order" });
  }

  await prisma.$transaction(async (tx) => {
    if (order.status === "planned" || order.status === "in_production") {
      await deallocateStock(tx, id, order.orderParts);
      await returnFinishedGoods(tx, id, order.productId, order.fulfilledFromStock);
    }
    await tx.order.update({ where: { id }, data: { status: "cancelled" } });
  });

  const updated = await prisma.order.findUnique({
    where:   { id },
    include: { product: true, customer: true, orderParts: { include: { part: true } } },
  });
  res.json(updated);
});

module.exports = router;
