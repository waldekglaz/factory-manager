import prisma from "@/lib/prisma";

export async function GET() {
  const locations = await prisma.location.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { partStocks: true, productStocks: true } },
      partStocks:    { select: { quantity: true } },
      productStocks: { select: { quantity: true } },
    },
  });

  const result = locations.map((loc) => ({
    ...loc,
    totalPartUnits:    loc.partStocks.reduce((s, r) => s + r.quantity, 0),
    totalProductUnits: loc.productStocks.reduce((s, r) => s + r.quantity, 0),
    partStocks:    undefined,
    productStocks: undefined,
  }));

  return Response.json(result);
}

export async function POST(request) {
  const { name, code, description, isRemote, deliveryDays } = await request.json();
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  const location = await prisma.location.create({
    data: {
      name:         name.trim(),
      code:         code        ? code.trim()       : null,
      description:  description ? description.trim() : "",
      isRemote:     isRemote    ? Boolean(isRemote)  : false,
      deliveryDays: isRemote && deliveryDays != null ? Number(deliveryDays) : null,
    },
  });
  return Response.json(location, { status: 201 });
}
