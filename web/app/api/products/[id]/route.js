import prisma from "@/lib/prisma";

export async function GET(request, { params }) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where:   { id: Number(id) },
    include: {
      productParts: { include: { part: true } },
      orders:       { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
  return Response.json(product);
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const numId = Number(id);
  const { name, dailyCapacity, description, finishedStock, parts, locationStocks } =
    await request.json();

  const product = await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: numId },
      data: {
        ...(name          != null && { name: name.trim() }),
        ...(dailyCapacity != null && { dailyCapacity: Number(dailyCapacity) }),
        ...(description   != null && { description }),
        ...(finishedStock != null && { finishedStock: Number(finishedStock) }),
      },
    });

    if (parts) {
      await tx.productPart.deleteMany({ where: { productId: numId } });
      await tx.productPart.createMany({
        data: parts.map((p) => ({
          productId:        numId,
          partId:           Number(p.partId),
          materialQty:      Number(p.materialQty),
          productsPerBatch: Number(p.productsPerBatch),
          scrapFactor:      Number(p.scrapFactor ?? 0),
        })),
      });
    }

    if (locationStocks !== undefined) {
      await tx.productLocationStock.deleteMany({ where: { productId: numId } });
      const rows = locationStocks.filter((ls) => Number(ls.quantity) > 0);
      if (rows.length > 0) {
        await tx.productLocationStock.createMany({
          data: rows.map((ls) => ({
            productId:  numId,
            locationId: Number(ls.locationId),
            quantity:   Number(ls.quantity),
          })),
        });
      }
    }

    return tx.product.findUnique({
      where:   { id: numId },
      include: {
        productParts:   { include: { part: true } },
        locationStocks: { include: { location: { select: { id: true, name: true, code: true } } } },
      },
    });
  });

  return Response.json(product);
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const numId = Number(id);

  const activeOrderCount = await prisma.order.count({
    where: { productId: numId, status: { not: "cancelled" } },
  });
  if (activeOrderCount > 0) {
    return Response.json(
      { error: `Product has ${activeOrderCount} active order(s). Cancel them first.` },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    const cancelledOrders = await tx.order.findMany({
      where: { productId: numId, status: "cancelled" },
      select: { id: true },
    });
    if (cancelledOrders.length > 0) {
      const orderIds = cancelledOrders.map((o) => o.id);
      await tx.orderPart.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    await tx.product.delete({ where: { id: numId } });
  });

  return Response.json({ message: "Product deleted" });
}
