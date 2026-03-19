import prisma from "@/lib/prisma";

export async function POST(request) {
  const { productId, fromLocationId, toLocationId, quantity } = await request.json();
  const qty = Number(quantity);

  if (!productId || !fromLocationId || !toLocationId || !qty || qty <= 0) {
    return Response.json(
      { error: "productId, fromLocationId, toLocationId, and quantity are required" },
      { status: 400 }
    );
  }
  if (Number(fromLocationId) === Number(toLocationId)) {
    return Response.json(
      { error: "Source and destination must be different" },
      { status: 400 }
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const source = await tx.productLocationStock.findUnique({
      where: { productId_locationId: { productId: Number(productId), locationId: Number(fromLocationId) } },
    });
    if (!source || source.quantity < qty) {
      throw new Error(
        `Not enough stock in source location (has ${source?.quantity ?? 0}, need ${qty})`
      );
    }

    await tx.productLocationStock.update({
      where: { productId_locationId: { productId: Number(productId), locationId: Number(fromLocationId) } },
      data:  { quantity: { decrement: qty } },
    });

    await tx.productLocationStock.upsert({
      where:  { productId_locationId: { productId: Number(productId), locationId: Number(toLocationId) } },
      update: { quantity: { increment: qty } },
      create: { productId: Number(productId), locationId: Number(toLocationId), quantity: qty },
    });

    await tx.finishedGoodsMovement.createMany({
      data: [
        { productId: Number(productId), locationId: Number(fromLocationId), quantity: -qty, reason: `transferred_to_location_#${toLocationId}` },
        { productId: Number(productId), locationId: Number(toLocationId),   quantity:  qty, reason: `transferred_from_location_#${fromLocationId}` },
      ],
    });

    return tx.productLocationStock.findMany({
      where:   { productId: Number(productId) },
      include: { location: true },
    });
  });

  return Response.json(result);
}
