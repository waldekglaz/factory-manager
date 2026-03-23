import prisma from "@/lib/prisma";
import { requireAuth, MANAGER_ONLY } from "@/lib/auth";

export async function GET(request) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;
  const parts = await prisma.part.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { productParts: true } },
      locationStocks: {
        where:   { quantity: { gt: 0 } },
        include: { location: { select: { id: true, name: true, code: true } } },
        orderBy: { quantity: "desc" },
      },
    },
  });
  return Response.json(parts);
}

export async function POST(request) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;

  const { name, currentStock, minimumStock, supplierLeadTime, unit, locationStocks } =
    await request.json();

  if (!name || supplierLeadTime == null) {
    return Response.json(
      { error: "name and supplierLeadTime are required" },
      { status: 400 }
    );
  }

  const part = await prisma.$transaction(async (tx) => {
    const created = await tx.part.create({
      data: {
        name:             name.trim(),
        currentStock:     currentStock != null ? Number(currentStock) : 0,
        minimumStock:     minimumStock != null && minimumStock !== "" ? Number(minimumStock) : null,
        supplierLeadTime: Number(supplierLeadTime),
        unit:             unit ?? "pcs",
      },
    });

    if (locationStocks && locationStocks.length > 0) {
      await tx.partLocationStock.createMany({
        data: locationStocks
          .filter((ls) => Number(ls.quantity) > 0)
          .map((ls) => ({
            partId:     created.id,
            locationId: Number(ls.locationId),
            quantity:   Number(ls.quantity),
          })),
      });
    }

    return tx.part.findUnique({
      where: { id: created.id },
      include: {
        _count: { select: { productParts: true } },
        locationStocks: {
          include: { location: { select: { id: true, name: true, code: true } } },
        },
      },
    });
  });

  return Response.json(part, { status: 201 });
}
