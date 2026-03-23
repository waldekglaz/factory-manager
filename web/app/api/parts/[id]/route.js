import prisma from "@/lib/prisma";
import { calculateProductionPlan } from "@/lib/productionPlanner";
import { requireAuth, MANAGER_ONLY } from "@/lib/auth";

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

export async function PUT(request, { params }) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;

  const { id } = await params;
  const numId = Number(id);
  const { name, currentStock, minimumStock, supplierLeadTime, unit, locationStocks } =
    await request.json();

  const stockChanged = currentStock != null || locationStocks !== undefined;

  const part = await prisma.$transaction(async (tx) => {
    await tx.part.update({
      where: { id: numId },
      data: {
        ...(name             != null && { name: name.trim() }),
        ...(currentStock     != null && { currentStock: Number(currentStock) }),
        ...(minimumStock     !== undefined && {
          minimumStock: minimumStock !== "" ? Number(minimumStock) : null,
        }),
        ...(supplierLeadTime != null && { supplierLeadTime: Number(supplierLeadTime) }),
        ...(unit             != null && { unit }),
      },
    });

    if (locationStocks !== undefined) {
      await tx.partLocationStock.deleteMany({ where: { partId: numId } });
      const rows = locationStocks.filter((ls) => Number(ls.quantity) > 0);
      if (rows.length > 0) {
        await tx.partLocationStock.createMany({
          data: rows.map((ls) => ({
            partId:     numId,
            locationId: Number(ls.locationId),
            quantity:   Number(ls.quantity),
          })),
        });
      }
    }

    return tx.part.findUnique({
      where: { id: numId },
      include: {
        _count: { select: { productParts: true } },
        locationStocks: {
          where:   { quantity: { gt: 0 } },
          include: { location: { select: { id: true, name: true, code: true } } },
          orderBy: { quantity: "desc" },
        },
      },
    });
  });

  // Auto-recalculate all planned orders that use this part when stock changes
  if (stockChanged) {
    const affectedOrders = await prisma.order.findMany({
      where:   { status: "planned", orderParts: { some: { partId: numId } } },
      include: { orderParts: true, product: { include: PRODUCT_WITH_BOM } },
    });

    for (const order of affectedOrders) {
      await prisma.$transaction(async (tx) => {
        // Return current allocations
        for (const op of order.orderParts) {
          if (op.quantityInStock <= 0) continue;
          await tx.part.update({ where: { id: op.partId }, data: { currentStock: { increment: op.quantityInStock } } });
          await tx.stockMovement.create({ data: { partId: op.partId, quantity: op.quantityInStock, reason: `recalc_from_part_edit_#${numId}` } });
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

  return Response.json(part);
}

export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;

  const { id } = await params;
  const numId = Number(id);

  const usageCount = await prisma.productPart.count({ where: { partId: numId } });
  if (usageCount > 0) {
    return Response.json(
      { error: `Part is used in ${usageCount} product(s). Remove from BOM first.` },
      { status: 409 }
    );
  }

  await prisma.stockMovement.deleteMany({ where: { partId: numId } });
  await prisma.part.delete({ where: { id: numId } });
  return Response.json({ message: "Part deleted" });
}
