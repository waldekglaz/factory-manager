import prisma from "@/lib/prisma";

export async function GET() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  const [
    allParts,
    orderCounts,
    inProductionOrders,
    plannedOrders,
    recentlyCompleted,
    productsInStock,
  ] = await Promise.all([
    prisma.part.findMany({ orderBy: { name: "asc" } }),
    prisma.order.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.order.findMany({
      where:   { status: "in_production" },
      include: { product: true },
      orderBy: { productionEndDate: "asc" },
    }),
    prisma.order.findMany({
      where:   { status: "planned" },
      include: { product: true, orderParts: { include: { part: true } } },
      orderBy: { productionStartDate: "asc" },
    }),
    prisma.order.findMany({
      where:   { status: "completed" },
      include: { product: true },
      orderBy: { updatedAt: "desc" },
      take:    5,
    }),
    prisma.product.findMany({
      where:  { finishedStock: { gt: 0 } },
      select: { id: true, name: true, finishedStock: true },
    }),
  ]);

  const outOfStock = allParts.filter((p) => p.currentStock === 0);
  const lowStock   = allParts.filter(
    (p) => p.minimumStock != null && p.currentStock > 0 && p.currentStock <= p.minimumStock
  );

  const statusMap = Object.fromEntries(orderCounts.map((r) => [r.status, r._count.id]));

  const plannedWithFlags = plannedOrders.map((o) => ({
    ...o,
    startingSoon: o.productionStartDate && new Date(o.productionStartDate) <= weekFromNow,
    hasShortage:  o.orderParts.some((op) => op.quantityMissing > 0),
  }));

  const inProductionWithFlags = inProductionOrders.map((o) => ({
    ...o,
    endingSoon: o.productionEndDate && new Date(o.productionEndDate) <= weekFromNow,
    overdue:    o.productionEndDate && new Date(o.productionEndDate) < today,
  }));

  return Response.json({
    stats: {
      planned:      statusMap["planned"]       ?? 0,
      inProduction: statusMap["in_production"] ?? 0,
      completed:    statusMap["completed"]     ?? 0,
      cancelled:    statusMap["cancelled"]     ?? 0,
      outOfStock:   outOfStock.length,
      lowStock:     lowStock.length,
      totalParts:   allParts.length,
    },
    alerts:             { outOfStock, lowStock },
    inProductionOrders: inProductionWithFlags,
    plannedOrders:      plannedWithFlags,
    recentlyCompleted,
    availableToShip:    productsInStock.length,
    productsInStock,
  });
}
