import prisma from "@/lib/prisma";

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

export async function GET(request, { params }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where:   { id: Number(id) },
    include: {
      product:    { include: PRODUCT_WITH_BOM },
      customer:   true,
      orderParts: { include: { part: true } },
    },
  });
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  return Response.json(order);
}
