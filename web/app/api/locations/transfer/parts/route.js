import prisma from "@/lib/prisma";
import { requireAuth, MANAGER_ONLY } from "@/lib/auth";

export async function POST(request) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;
  const { partId, fromLocationId, toLocationId, quantity } = await request.json();
  const qty = Number(quantity);

  if (!partId || !fromLocationId || !toLocationId || !qty || qty <= 0) {
    return Response.json(
      { error: "partId, fromLocationId, toLocationId, and quantity are required" },
      { status: 400 }
    );
  }
  if (Number(fromLocationId) === Number(toLocationId)) {
    return Response.json(
      { error: "Source and destination locations must be different" },
      { status: 400 }
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const source = await tx.partLocationStock.findUnique({
      where: { partId_locationId: { partId: Number(partId), locationId: Number(fromLocationId) } },
    });
    if (!source || source.quantity < qty) {
      throw new Error(
        `Not enough stock in source location (has ${source?.quantity ?? 0}, need ${qty})`
      );
    }

    await tx.partLocationStock.update({
      where: { partId_locationId: { partId: Number(partId), locationId: Number(fromLocationId) } },
      data:  { quantity: { decrement: qty } },
    });

    await tx.partLocationStock.upsert({
      where:  { partId_locationId: { partId: Number(partId), locationId: Number(toLocationId) } },
      update: { quantity: { increment: qty } },
      create: { partId: Number(partId), locationId: Number(toLocationId), quantity: qty },
    });

    await tx.stockMovement.createMany({
      data: [
        { partId: Number(partId), locationId: Number(fromLocationId), quantity: -qty, reason: `transferred_to_location_#${toLocationId}` },
        { partId: Number(partId), locationId: Number(toLocationId),   quantity:  qty, reason: `transferred_from_location_#${fromLocationId}` },
      ],
    });

    return tx.partLocationStock.findMany({
      where:   { partId: Number(partId) },
      include: { location: true },
    });
  });

  return Response.json(result);
}
