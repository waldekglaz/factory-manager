import prisma from "@/lib/prisma";
import { calculateProductionPlan } from "@/lib/productionPlanner";

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

export async function POST(request, { params }) {
  const { id } = await params;
  const poId = Number(id);
  const { lines } = await request.json();

  if (!lines || lines.length === 0) {
    return Response.json({ error: "lines is required" }, { status: 400 });
  }

  const po = await prisma.purchaseOrder.findUnique({
    where:   { id: poId },
    include: { lines: { include: { part: true } } },
  });
  if (!po) return Response.json({ error: "Purchase order not found" }, { status: 404 });
  if (po.status === "cancelled") {
    return Response.json({ error: "Cannot receive a cancelled purchase order" }, { status: 409 });
  }

  const receivedPartIds = new Set();

  await prisma.$transaction(async (tx) => {
    for (const { lineId, quantityReceived, locationId } of lines) {
      const qty = Number(quantityReceived);
      if (!qty || qty <= 0) continue;

      const line = po.lines.find((l) => l.id === Number(lineId));
      if (!line) continue;

      const toReceive = Math.min(qty, line.quantityOrdered - line.quantityReceived);
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
        data: { partId: line.partId, quantity: toReceive, reason: `purchase_order_#${poId}` },
      });

      if (locationId) {
        await tx.partLocationStock.upsert({
          where:  { partId_locationId: { partId: line.partId, locationId: Number(locationId) } },
          update: { quantity: { increment: toReceive } },
          create: { partId: line.partId, locationId: Number(locationId), quantity: toReceive },
        });
      }

      receivedPartIds.add(line.partId);
    }

    const updatedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: poId } });
    const allReceived  = updatedLines.every((l) => l.quantityReceived >= l.quantityOrdered);
    const anyReceived  = updatedLines.some((l)  => l.quantityReceived > 0);
    const newStatus    = allReceived ? "received" : anyReceived ? "partial" : po.status;
    await tx.purchaseOrder.update({ where: { id: poId }, data: { status: newStatus } });
  });

  // Auto-recalculate planned orders waiting for parts we just received
  if (receivedPartIds.size > 0) {
    const waitingOrders = await prisma.order.findMany({
      where: {
        status: "planned",
        orderParts: {
          some: { partId: { in: Array.from(receivedPartIds) }, quantityMissing: { gt: 0 } },
        },
      },
      include: {
        orderParts: true,
        product:    { include: PRODUCT_WITH_BOM },
      },
    });

    for (const order of waitingOrders) {
      await prisma.$transaction(async (tx) => {
        for (const op of order.orderParts) {
          if (op.quantityInStock <= 0) continue;
          await tx.part.update({ where: { id: op.partId }, data: { currentStock: { increment: op.quantityInStock } } });
          await tx.stockMovement.create({ data: { partId: op.partId, quantity: op.quantityInStock, reason: `recalc_from_po_#${poId}` } });
        }
        if (order.fulfilledFromStock > 0) {
          await tx.product.update({ where: { id: order.productId }, data: { finishedStock: { increment: order.fulfilledFromStock } } });
        }

        const freshProduct = await tx.product.findUnique({
          where:   { id: order.productId },
          include: PRODUCT_WITH_BOM,
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
  return Response.json(updated);
}
