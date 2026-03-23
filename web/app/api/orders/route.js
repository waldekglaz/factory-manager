import prisma from "@/lib/prisma";
import { calculateProductionPlan } from "@/lib/productionPlanner";
import { requireAuth, ALL_ROLES, MANAGER_ONLY } from "@/lib/auth";

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

export async function GET(request) {
  const auth = await requireAuth(request, ALL_ROLES);
  if (auth.error) return auth.error;

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      product:    true,
      customer:   true,
      orderParts: { include: { part: true } },
    },
  });
  return Response.json(orders);
}

export async function POST(request) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;

  const { productId, customerId, quantity, desiredDeadline, notes } = await request.json();

  if (!productId || !quantity) {
    return Response.json({ error: "productId and quantity are required" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where:   { id: Number(productId) },
    include: PRODUCT_WITH_BOM,
  });
  if (!product) return Response.json({ error: "Product not found" }, { status: 404 });

  const plan = calculateProductionPlan(
    product,
    Number(quantity),
    desiredDeadline ? new Date(desiredDeadline) : null
  );

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        productId:           product.id,
        customerId:          customerId ? Number(customerId) : null,
        quantity:            Number(quantity),
        desiredDeadline:     desiredDeadline ? new Date(desiredDeadline) : null,
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

    // Deduct raw material stock
    for (const p of plan.partsBreakdown) {
      if (p.quantityInStock <= 0) continue;
      await tx.part.update({ where: { id: p.partId }, data: { currentStock: { decrement: p.quantityInStock } } });
      await tx.stockMovement.create({ data: { partId: p.partId, quantity: -p.quantityInStock, reason: `allocated_to_order_#${created.id}` } });
    }

    // Reserve finished goods
    if (plan.fulfilledFromStock > 0) {
      await tx.product.update({ where: { id: product.id }, data: { finishedStock: { decrement: plan.fulfilledFromStock } } });
      await tx.finishedGoodsMovement.create({ data: { productId: product.id, quantity: -plan.fulfilledFromStock, reason: `reserved_for_order_#${created.id}` } });
    }

    return tx.order.findUnique({
      where:   { id: created.id },
      include: { product: true, customer: true, orderParts: { include: { part: true } } },
    });
  });

  return Response.json(order, { status: 201 });
}
