/**
 * Orders Routes
 *
 * Stock allocation model:
 *   - On ORDER CREATION  → available stock is deducted immediately (allocated)
 *   - On START           → status change only (stock already allocated)
 *   - On CANCEL          → allocated stock is returned to stock
 *   - On RECALCULATE     → undo old allocation → re-plan → re-allocate
 *   - On COMPLETE        → status change only (stock was consumed at creation)
 *
 * "currentStock" on a Part always reflects UNALLOCATED stock.
 */

const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { calculateProductionPlan } = require("../services/productionPlanner");

const router = express.Router();
const prisma = new PrismaClient();

// ── Shared helper: deduct allocated quantities from stock ─────────────────────
async function allocateStock(tx, orderId, partsBreakdown) {
  for (const p of partsBreakdown) {
    if (p.quantityInStock <= 0) continue;
    await tx.part.update({
      where: { id: p.partId },
      data: { currentStock: { decrement: p.quantityInStock } },
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

// ── Shared helper: return allocated quantities back to stock ──────────────────
async function deallocateStock(tx, orderId, orderParts) {
  for (const op of orderParts) {
    if (op.quantityInStock <= 0) continue;
    await tx.part.update({
      where: { id: op.partId },
      data: { currentStock: { increment: op.quantityInStock } },
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

// ── List all orders ───────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      product: true,
      orderParts: { include: { part: true } },
    },
  });
  res.json(orders);
});

// ── Single order detail ───────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      product: { include: { productParts: { include: { part: true } } } },
      orderParts: { include: { part: true } },
    },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

// ── Place a new order ─────────────────────────────────────────────────────────
// Runs the planning algorithm and immediately allocates available stock.
router.post("/", async (req, res) => {
  const { productId, quantity, desiredDeadline, notes } = req.body;

  if (!productId || !quantity) {
    return res.status(400).json({ error: "productId and quantity are required" });
  }

  const product = await prisma.product.findUnique({
    where: { id: Number(productId) },
    include: { productParts: { include: { part: true } } },
  });
  if (!product) return res.status(404).json({ error: "Product not found" });

  const plan = calculateProductionPlan(
    product,
    Number(quantity),
    desiredDeadline ? new Date(desiredDeadline) : null
  );

  // Create order + allocate stock atomically
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        productId: product.id,
        quantity: Number(quantity),
        desiredDeadline: desiredDeadline ? new Date(desiredDeadline) : null,
        productionStartDate: plan.productionStartDate,
        productionEndDate: plan.productionEndDate,
        isOnTime: plan.isOnTime,
        notes: notes ?? "",
        orderParts: {
          create: plan.partsBreakdown.map((p) => ({
            partId:          p.partId,
            quantityNeeded:  p.quantityNeeded,
            quantityInStock: p.quantityInStock,  // what we're deducting now
            quantityMissing: p.quantityMissing,
            availableDate:   p.availableDate,
          })),
        },
      },
    });

    // Deduct the available portion from stock immediately
    await allocateStock(tx, created.id, plan.partsBreakdown);

    return tx.order.findUnique({
      where: { id: created.id },
      include: { product: true, orderParts: { include: { part: true } } },
    });
  });

  res.status(201).json(order);
});

// ── Recalculate production plan ───────────────────────────────────────────────
// 1. Returns previously allocated stock
// 2. Re-runs planning against refreshed stock levels
// 3. Re-allocates based on the new plan
router.post("/:id/recalculate", async (req, res) => {
  const id = Number(req.params.id);

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      orderParts: true,
      product: { include: { productParts: { include: { part: true } } } },
    },
  });

  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status !== "planned") {
    return res.status(409).json({ error: `Cannot recalculate a ${order.status} order` });
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Step 1: return previously allocated stock
    await deallocateStock(tx, id, order.orderParts);

    // Step 2: re-load parts with refreshed stock (after return above)
    const freshProduct = await tx.product.findUnique({
      where: { id: order.product.id },
      include: { productParts: { include: { part: true } } },
    });

    // Step 3: re-run planning
    const plan = calculateProductionPlan(
      freshProduct,
      order.quantity,
      order.desiredDeadline ? new Date(order.desiredDeadline) : null
    );

    // Step 4: replace orderParts snapshot
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

    // Step 5: re-allocate stock
    await allocateStock(tx, id, plan.partsBreakdown);

    // Step 6: update order dates
    await tx.order.update({
      where: { id },
      data: {
        productionStartDate: plan.productionStartDate,
        productionEndDate:   plan.productionEndDate,
        isOnTime:            plan.isOnTime,
      },
    });

    return tx.order.findUnique({
      where: { id },
      include: { product: true, orderParts: { include: { part: true } } },
    });
  });

  res.json(updated);
});

// ── Start production ──────────────────────────────────────────────────────────
// Stock is already allocated — just update status.
// Block start if there are still missing parts (shortage not resolved).
router.post("/:id/start", async (req, res) => {
  const id = Number(req.params.id);

  const order = await prisma.order.findUnique({
    where: { id },
    include: { orderParts: true },
  });

  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status !== "planned") {
    return res.status(409).json({ error: `Order is already ${order.status}` });
  }

  // Cannot start if any parts are still missing (not yet received from supplier)
  const stillMissing = order.orderParts.filter((op) => op.quantityMissing > 0);
  if (stillMissing.length > 0) {
    return res.status(409).json({
      error: "Cannot start — some materials have not arrived yet. Recalculate first after updating stock.",
      missing: stillMissing.map((op) => ({ partId: op.partId, qty: op.quantityMissing })),
    });
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status: "in_production" },
    include: { product: true, orderParts: { include: { part: true } } },
  });

  res.json(updated);
});

// ── Complete order ────────────────────────────────────────────────────────────
router.post("/:id/complete", async (req, res) => {
  const id = Number(req.params.id);
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status !== "in_production") {
    return res.status(409).json({ error: `Order must be in_production to complete (currently: ${order.status})` });
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status: "completed" },
    include: { product: true, orderParts: { include: { part: true } } },
  });

  res.json(updated);
});

// ── Cancel order ──────────────────────────────────────────────────────────────
// Returns allocated stock back to the warehouse.
router.post("/:id/cancel", async (req, res) => {
  const id = Number(req.params.id);

  const order = await prisma.order.findUnique({
    where: { id },
    include: { orderParts: true },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status === "completed") {
    return res.status(409).json({ error: "Cannot cancel a completed order" });
  }

  await prisma.$transaction(async (tx) => {
    // Return allocated stock only for planned/in_production (not already cancelled)
    if (order.status === "planned" || order.status === "in_production") {
      await deallocateStock(tx, id, order.orderParts);
    }
    await tx.order.update({ where: { id }, data: { status: "cancelled" } });
  });

  const updated = await prisma.order.findUnique({
    where: { id },
    include: { product: true, orderParts: { include: { part: true } } },
  });

  res.json(updated);
});

module.exports = router;
