import prisma from "@/lib/prisma";
import { requireAuth, MANAGER_DISPATCHER } from "@/lib/auth";

export async function POST(request, { params }) {
  const auth = await requireAuth(request, MANAGER_DISPATCHER);
  if (auth.error) return auth.error;

  const { id } = await params;
  const numId = Number(id);

  const order = await prisma.order.findUnique({ where: { id: numId } });
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "in_production") {
    return Response.json(
      { error: `Order must be in_production to complete (currently: ${order.status})` },
      { status: 409 }
    );
  }

  const productionQty = order.quantity - order.fulfilledFromStock;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: numId }, data: { status: "completed" } });

    if (productionQty > 0) {
      await tx.product.update({
        where: { id: order.productId },
        data:  { finishedStock: { increment: productionQty } },
      });
      await tx.finishedGoodsMovement.create({
        data: { productId: order.productId, quantity: productionQty, reason: `order_#${numId}_completed` },
      });
    }

    return tx.order.findUnique({
      where:   { id: numId },
      include: { product: true, customer: true, orderParts: { include: { part: true } } },
    });
  });

  return Response.json(updated);
}
