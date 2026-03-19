import prisma from "@/lib/prisma";

export async function POST(request, { params }) {
  const { id } = await params;
  const numId = Number(id);

  const order = await prisma.order.findUnique({
    where:   { id: numId },
    include: { orderParts: true },
  });
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "planned") {
    return Response.json({ error: `Order is already ${order.status}` }, { status: 409 });
  }

  const stillMissing = order.orderParts.filter((op) => op.quantityMissing > 0);
  if (stillMissing.length > 0) {
    return Response.json(
      {
        error:   "Cannot start — some materials have not arrived yet. Recalculate first after updating stock.",
        missing: stillMissing.map((op) => ({ partId: op.partId, qty: op.quantityMissing })),
      },
      { status: 409 }
    );
  }

  const updated = await prisma.order.update({
    where:   { id: numId },
    data:    { status: "in_production" },
    include: { product: true, customer: true, orderParts: { include: { part: true } } },
  });
  return Response.json(updated);
}
