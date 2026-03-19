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
  const numId = Number(id);

  const order = await prisma.order.findUnique({
    where:   { id: numId },
    include: { orderParts: true, product: { include: PRODUCT_WITH_BOM } },
  });
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "planned") {
    return Response.json({ error: `Cannot recalculate a ${order.status} order` }, { status: 409 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Return allocations
    for (const op of order.orderParts) {
      if (op.quantityInStock <= 0) continue;
      await tx.part.update({ where: { id: op.partId }, data: { currentStock: { increment: op.quantityInStock } } });
      await tx.stockMovement.create({ data: { partId: op.partId, quantity: op.quantityInStock, reason: `deallocated_from_order_#${numId}` } });
    }
    if (order.fulfilledFromStock > 0) {
      await tx.product.update({ where: { id: order.productId }, data: { finishedStock: { increment: order.fulfilledFromStock } } });
      await tx.finishedGoodsMovement.create({ data: { productId: order.productId, quantity: order.fulfilledFromStock, reason: `returned_from_order_#${numId}` } });
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

    await tx.orderPart.deleteMany({ where: { orderId: numId } });
    await tx.orderPart.createMany({
      data: plan.partsBreakdown.map((p) => ({
        orderId:         numId,
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
      await tx.stockMovement.create({ data: { partId: p.partId, quantity: -p.quantityInStock, reason: `allocated_to_order_#${numId}` } });
    }
    if (plan.fulfilledFromStock > 0) {
      await tx.product.update({ where: { id: order.productId }, data: { finishedStock: { decrement: plan.fulfilledFromStock } } });
      await tx.finishedGoodsMovement.create({ data: { productId: order.productId, quantity: -plan.fulfilledFromStock, reason: `reserved_for_order_#${numId}` } });
    }

    await tx.order.update({
      where: { id: numId },
      data: {
        productionStartDate: plan.productionStartDate,
        productionEndDate:   plan.productionEndDate,
        isOnTime:            plan.isOnTime,
        fulfilledFromStock:  plan.fulfilledFromStock,
      },
    });

    return tx.order.findUnique({
      where:   { id: numId },
      include: { product: true, customer: true, orderParts: { include: { part: true } } },
    });
  });

  return Response.json(updated);
}
