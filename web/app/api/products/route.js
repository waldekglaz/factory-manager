import prisma from "@/lib/prisma";

export async function GET() {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      productParts: { include: { part: true } },
      locationStocks: {
        where:   { quantity: { gt: 0 } },
        include: { location: { select: { id: true, name: true, code: true } } },
        orderBy: { quantity: "desc" },
      },
    },
  });
  return Response.json(products);
}

export async function POST(request) {
  const { name, dailyCapacity, description, finishedStock, sellingPrice, parts, locationStocks } =
    await request.json();

  if (!name || dailyCapacity == null) {
    return Response.json({ error: "name and dailyCapacity are required" }, { status: 400 });
  }
  if (!parts || parts.length === 0) {
    return Response.json({ error: "At least one part is required in BOM" }, { status: 400 });
  }

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        name:          name.trim(),
        dailyCapacity: Number(dailyCapacity),
        description:   description ?? "",
        finishedStock: Number(finishedStock ?? 0),
        ...(sellingPrice != null && sellingPrice !== "" && { sellingPrice: Number(sellingPrice) }),
        productParts: {
          create: parts.map((p) => ({
            partId:           Number(p.partId),
            materialQty:      Number(p.materialQty),
            productsPerBatch: Number(p.productsPerBatch),
            scrapFactor:      Number(p.scrapFactor ?? 0),
          })),
        },
      },
    });

    if (locationStocks && locationStocks.length > 0) {
      await tx.productLocationStock.createMany({
        data: locationStocks
          .filter((ls) => Number(ls.quantity) > 0)
          .map((ls) => ({
            productId:  created.id,
            locationId: Number(ls.locationId),
            quantity:   Number(ls.quantity),
          })),
      });
    }

    return tx.product.findUnique({
      where:   { id: created.id },
      include: {
        productParts:   { include: { part: true } },
        locationStocks: { include: { location: { select: { id: true, name: true, code: true } } } },
      },
    });
  });

  return Response.json(product, { status: 201 });
}
