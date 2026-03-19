import prisma from "@/lib/prisma";

export async function GET(request, { params }) {
  const { id } = await params;
  const orders = await prisma.order.findMany({
    where:   { customerId: Number(id) },
    orderBy: { createdAt: "desc" },
    include: { product: true },
  });
  return Response.json(orders);
}
