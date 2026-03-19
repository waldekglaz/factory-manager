import prisma from "@/lib/prisma";

export async function PUT(request, { params }) {
  const { id } = await params;
  const numId = Number(id);
  const { name, currentStock, minimumStock, supplierLeadTime, unit, locationStocks } =
    await request.json();

  const part = await prisma.$transaction(async (tx) => {
    await tx.part.update({
      where: { id: numId },
      data: {
        ...(name             != null && { name: name.trim() }),
        ...(currentStock     != null && { currentStock: Number(currentStock) }),
        ...(minimumStock     !== undefined && {
          minimumStock: minimumStock !== "" ? Number(minimumStock) : null,
        }),
        ...(supplierLeadTime != null && { supplierLeadTime: Number(supplierLeadTime) }),
        ...(unit             != null && { unit }),
      },
    });

    if (locationStocks !== undefined) {
      await tx.partLocationStock.deleteMany({ where: { partId: numId } });
      const rows = locationStocks.filter((ls) => Number(ls.quantity) > 0);
      if (rows.length > 0) {
        await tx.partLocationStock.createMany({
          data: rows.map((ls) => ({
            partId:     numId,
            locationId: Number(ls.locationId),
            quantity:   Number(ls.quantity),
          })),
        });
      }
    }

    return tx.part.findUnique({
      where: { id: numId },
      include: {
        _count: { select: { productParts: true } },
        locationStocks: {
          where:   { quantity: { gt: 0 } },
          include: { location: { select: { id: true, name: true, code: true } } },
          orderBy: { quantity: "desc" },
        },
      },
    });
  });

  return Response.json(part);
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const numId = Number(id);

  const usageCount = await prisma.productPart.count({ where: { partId: numId } });
  if (usageCount > 0) {
    return Response.json(
      { error: `Part is used in ${usageCount} product(s). Remove from BOM first.` },
      { status: 409 }
    );
  }

  await prisma.stockMovement.deleteMany({ where: { partId: numId } });
  await prisma.part.delete({ where: { id: numId } });
  return Response.json({ message: "Part deleted" });
}
