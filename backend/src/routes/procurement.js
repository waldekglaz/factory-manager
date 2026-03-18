/**
 * Procurement Routes — Suppliers & Purchase Orders
 *
 * Suppliers:
 *   GET  /api/suppliers          → list all suppliers
 *   POST /api/suppliers          → create supplier
 *   PUT  /api/suppliers/:id      → update supplier
 *   DELETE /api/suppliers/:id    → delete supplier (if no purchase orders)
 *   POST /api/suppliers/:id/parts → link a part to a supplier (with optional cost/lead time)
 *   DELETE /api/suppliers/:supplierId/parts/:partId → unlink part from supplier
 *
 * Purchase Orders:
 *   GET  /api/purchase-orders         → list all POs
 *   POST /api/purchase-orders         → create PO (with lines)
 *   GET  /api/purchase-orders/:id     → single PO with lines
 *   PUT  /api/purchase-orders/:id     → update PO header (status, expectedDate, notes)
 *   POST /api/purchase-orders/:id/receive → receive delivery (update line quantities + stock)
 */

const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { calculateProductionPlan } = require("../services/productionPlanner");

const router = express.Router();
const prisma = new PrismaClient();

// ════════════════════════════════════════════════════════
//  SUPPLIERS
// ════════════════════════════════════════════════════════

router.get("/suppliers", async (req, res) => {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: {
      supplierParts: { include: { part: true } },
      _count: { select: { purchaseOrders: true } },
    },
  });
  res.json(suppliers);
});

router.post("/suppliers", async (req, res) => {
  const { name, email, phone, defaultLeadTime, notes } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const supplier = await prisma.supplier.create({
    data: {
      name:            name.trim(),
      email:           email           ?? null,
      phone:           phone           ?? null,
      defaultLeadTime: Number(defaultLeadTime ?? 7),
      notes:           notes           ?? "",
    },
  });
  res.status(201).json(supplier);
});

router.put("/suppliers/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, email, phone, defaultLeadTime, notes } = req.body;

  const supplier = await prisma.supplier.update({
    where: { id },
    data: {
      ...(name            != null && { name: name.trim() }),
      ...(email           != null && { email }),
      ...(phone           != null && { phone }),
      ...(defaultLeadTime != null && { defaultLeadTime: Number(defaultLeadTime) }),
      ...(notes           != null && { notes }),
    },
  });
  res.json(supplier);
});

router.delete("/suppliers/:id", async (req, res) => {
  const id = Number(req.params.id);

  const poCount = await prisma.purchaseOrder.count({ where: { supplierId: id } });
  if (poCount > 0) {
    return res.status(409).json({
      error: `Supplier has ${poCount} purchase order(s). Cannot delete.`,
    });
  }

  await prisma.supplier.delete({ where: { id } });
  res.json({ message: "Supplier deleted" });
});

// Link a part to a supplier
router.post("/suppliers/:id/parts", async (req, res) => {
  const supplierId = Number(req.params.id);
  const { partId, unitCost, leadTimeOverride } = req.body;
  if (!partId) return res.status(400).json({ error: "partId is required" });

  const sp = await prisma.supplierPart.upsert({
    where:  { supplierId_partId: { supplierId, partId: Number(partId) } },
    update: {
      unitCost:         unitCost         != null ? Number(unitCost)         : null,
      leadTimeOverride: leadTimeOverride != null ? Number(leadTimeOverride) : null,
    },
    create: {
      supplierId,
      partId:           Number(partId),
      unitCost:         unitCost         != null ? Number(unitCost)         : null,
      leadTimeOverride: leadTimeOverride != null ? Number(leadTimeOverride) : null,
    },
    include: { part: true, supplier: true },
  });
  res.json(sp);
});

// Unlink a part from a supplier
router.delete("/suppliers/:supplierId/parts/:partId", async (req, res) => {
  await prisma.supplierPart.delete({
    where: {
      supplierId_partId: {
        supplierId: Number(req.params.supplierId),
        partId:     Number(req.params.partId),
      },
    },
  });
  res.json({ message: "Part unlinked from supplier" });
});

// ════════════════════════════════════════════════════════
//  PURCHASE ORDERS
// ════════════════════════════════════════════════════════

router.get("/purchase-orders", async (req, res) => {
  const orders = await prisma.purchaseOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      supplier: true,
      lines: { include: { part: true } },
    },
  });
  res.json(orders);
});

router.get("/purchase-orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  const po = await prisma.purchaseOrder.findUnique({
    where:   { id },
    include: { supplier: true, lines: { include: { part: true } } },
  });
  if (!po) return res.status(404).json({ error: "Purchase order not found" });
  res.json(po);
});

router.post("/purchase-orders", async (req, res) => {
  const { supplierId, expectedDate, notes, lines } = req.body;
  if (!supplierId) return res.status(400).json({ error: "supplierId is required" });
  if (!lines || lines.length === 0) return res.status(400).json({ error: "At least one line is required" });

  const po = await prisma.purchaseOrder.create({
    data: {
      supplierId:   Number(supplierId),
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      notes:        notes ?? "",
      lines: {
        create: lines.map((l) => ({
          partId:          Number(l.partId),
          quantityOrdered: Number(l.quantityOrdered),
        })),
      },
    },
    include: { supplier: true, lines: { include: { part: true } } },
  });
  res.status(201).json(po);
});

router.put("/purchase-orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { status, expectedDate, notes } = req.body;

  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      ...(status       != null && { status }),
      ...(expectedDate != null && { expectedDate: new Date(expectedDate) }),
      ...(notes        != null && { notes }),
    },
    include: { supplier: true, lines: { include: { part: true } } },
  });
  res.json(po);
});

/**
 * POST /api/purchase-orders/:id/receive
 * Body: { lines: [{ lineId, quantityReceived }] }
 *
 * For each line:
 *   1. Update quantityReceived on the line
 *   2. Increment part.currentStock
 *   3. Create a StockMovement
 * After receiving, re-run planning on any planned orders waiting for those parts.
 */
router.post("/purchase-orders/:id/receive", async (req, res) => {
  const poId  = Number(req.params.id);
  const { lines } = req.body; // [{ lineId, quantityReceived }]

  if (!lines || lines.length === 0) {
    return res.status(400).json({ error: "lines is required" });
  }

  const po = await prisma.purchaseOrder.findUnique({
    where:   { id: poId },
    include: { lines: { include: { part: true } } },
  });
  if (!po) return res.status(404).json({ error: "Purchase order not found" });
  if (po.status === "cancelled") {
    return res.status(409).json({ error: "Cannot receive a cancelled purchase order" });
  }

  const receivedPartIds = new Set();

  await prisma.$transaction(async (tx) => {
    for (const { lineId, quantityReceived } of lines) {
      const qty = Number(quantityReceived);
      if (!qty || qty <= 0) continue;

      const line = po.lines.find((l) => l.id === Number(lineId));
      if (!line) continue;

      // Don't receive more than was ordered
      const alreadyReceived = line.quantityReceived;
      const remaining = line.quantityOrdered - alreadyReceived;
      const toReceive = Math.min(qty, remaining);
      if (toReceive <= 0) continue;

      await tx.purchaseOrderLine.update({
        where: { id: line.id },
        data:  { quantityReceived: { increment: toReceive } },
      });

      await tx.part.update({
        where: { id: line.partId },
        data:  { currentStock: { increment: toReceive } },
      });

      await tx.stockMovement.create({
        data: {
          partId:   line.partId,
          quantity: toReceive,
          reason:   `purchase_order_#${poId}`,
        },
      });

      receivedPartIds.add(line.partId);
    }

    // Update PO status based on total received
    const updatedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: poId } });
    const allReceived  = updatedLines.every((l) => l.quantityReceived >= l.quantityOrdered);
    const anyReceived  = updatedLines.some((l) => l.quantityReceived > 0);
    const newStatus    = allReceived ? "received" : anyReceived ? "partial" : po.status;
    await tx.purchaseOrder.update({ where: { id: poId }, data: { status: newStatus } });
  });

  // After stock is updated, auto-recalculate any planned orders that were waiting
  // for the parts we just received (those with shortages on those part IDs).
  if (receivedPartIds.size > 0) {
    const waitingOrders = await prisma.order.findMany({
      where: {
        status: "planned",
        orderParts: {
          some: {
            partId:          { in: Array.from(receivedPartIds) },
            quantityMissing: { gt: 0 },
          },
        },
      },
      include: {
        orderParts: true,
        product:    {
          include: {
            productParts: {
              include: {
                part: {
                  include: { supplierParts: { include: { supplier: true } } },
                },
              },
            },
          },
        },
      },
    });

    for (const order of waitingOrders) {
      await prisma.$transaction(async (tx) => {
        // Deallocate old
        for (const op of order.orderParts) {
          if (op.quantityInStock <= 0) continue;
          await tx.part.update({ where: { id: op.partId }, data: { currentStock: { increment: op.quantityInStock } } });
          await tx.stockMovement.create({ data: { partId: op.partId, quantity: op.quantityInStock, reason: `recalc_from_po_#${poId}` } });
        }
        if (order.fulfilledFromStock > 0) {
          await tx.product.update({ where: { id: order.productId }, data: { finishedStock: { increment: order.fulfilledFromStock } } });
        }

        // Fresh product
        const freshProduct = await tx.product.findUnique({
          where:   { id: order.productId },
          include: {
            productParts: {
              include: {
                part: { include: { supplierParts: { include: { supplier: true } } } },
              },
            },
          },
        });

        const plan = calculateProductionPlan(
          freshProduct,
          order.quantity,
          order.desiredDeadline ? new Date(order.desiredDeadline) : null
        );

        await tx.orderPart.deleteMany({ where: { orderId: order.id } });
        await tx.orderPart.createMany({
          data: plan.partsBreakdown.map((p) => ({
            orderId:         order.id,
            partId:          p.partId,
            quantityNeeded:  p.quantityNeeded,
            quantityInStock: p.quantityInStock,
            quantityMissing: p.quantityMissing,
            availableDate:   p.availableDate,
          })),
        });

        // Re-allocate
        for (const p of plan.partsBreakdown) {
          if (p.quantityInStock <= 0) continue;
          await tx.part.update({ where: { id: p.partId }, data: { currentStock: { decrement: p.quantityInStock } } });
          await tx.stockMovement.create({ data: { partId: p.partId, quantity: -p.quantityInStock, reason: `allocated_to_order_#${order.id}` } });
        }
        if (plan.fulfilledFromStock > 0) {
          await tx.product.update({ where: { id: order.productId }, data: { finishedStock: { decrement: plan.fulfilledFromStock } } });
        }

        await tx.order.update({
          where: { id: order.id },
          data: {
            productionStartDate: plan.productionStartDate,
            productionEndDate:   plan.productionEndDate,
            isOnTime:            plan.isOnTime,
            fulfilledFromStock:  plan.fulfilledFromStock,
          },
        });
      });
    }
  }

  const updated = await prisma.purchaseOrder.findUnique({
    where:   { id: poId },
    include: { supplier: true, lines: { include: { part: true } } },
  });
  res.json(updated);
});

module.exports = router;
