import prisma from "@/lib/prisma";

export async function GET(request, { params }) {
  const { id } = await params;

  const location = await prisma.location.findUnique({
    where: { id: Number(id) },
    include: {
      partStocks: {
        where:   { quantity: { gt: 0 } },
        include: { part: true },
        orderBy: { quantity: "desc" },
      },
      productStocks: {
        where:   { quantity: { gt: 0 } },
        include: { product: true },
        orderBy: { quantity: "desc" },
      },
    },
  });

  if (!location) return Response.json({ error: "Location not found" }, { status: 404 });
  return Response.json(location);
}
