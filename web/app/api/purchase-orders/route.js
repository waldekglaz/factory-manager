import prisma from "@/lib/prisma";

export async function GET() {
  const orders = await prisma.purchaseOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: { supplier: true, lines: { include: { part: true } } },
  });
  return Response.json(orders);
}

export async function POST(request) {
  const { supplierId, expectedDate, notes, lines } = await request.json();
  if (!supplierId) return Response.json({ error: "supplierId is required" }, { status: 400 });
  if (!lines || lines.length === 0) {
    return Response.json({ error: "At least one line is required" }, { status: 400 });
  }

  const po = await prisma.purchaseOrder.create({
    data: {
      supplierId:   Number(supplierId),
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      notes:        notes ?? "",
      lines: {
        create: lines.map((l) => ({
          partId:          Number(l.partId),
          quantityOrdered: Number(l.quantityOrdered),
        })),
      },
    },
    include: { supplier: true, lines: { include: { part: true } } },
  });
  return Response.json(po, { status: 201 });
}
