import prisma from "@/lib/prisma";

export async function POST(request, { params }) {
  const { id } = await params;
  const numId = Number(id);

  const order = await prisma.order.findUnique({
    where:   { id: numId },
    include: { orderParts: true },
  });
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  if (order.status === "completed") {
    return Response.json({ error: "Cannot cancel a completed order" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    if (order.status === "planned" || order.status === "in_production") {
      for (const op of order.orderParts) {
        if (op.quantityInStock <= 0) continue;
        await tx.part.update({ where: { id: op.partId }, data: { currentStock: { increment: op.quantityInStock } } });
        await tx.stockMovement.create({ data: { partId: op.partId, quantity: op.quantityInStock, reason: `deallocated_from_order_#${numId}` } });
      }
      if (order.fulfilledFromStock > 0) {
        await tx.product.update({ where: { id: order.productId }, data: { finishedStock: { increment: order.fulfilledFromStock } } });
        await tx.finishedGoodsMovement.create({ data: { productId: order.productId, quantity: order.fulfilledFromStock, reason: `returned_from_order_#${numId}` } });
      }
    }
    await tx.order.update({ where: { id: numId }, data: { status: "cancelled" } });
  });

  const updated = await prisma.order.findUnique({
    where:   { id: numId },
    include: { product: true, customer: true, orderParts: { include: { part: true } } },
  });
  return Response.json(updated);
}
