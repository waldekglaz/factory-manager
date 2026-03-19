import prisma from "@/lib/prisma";

export async function GET(request, { params }) {
  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({
    where:   { id: Number(id) },
    include: { supplier: true, lines: { include: { part: true } } },
  });
  if (!po) return Response.json({ error: "Purchase order not found" }, { status: 404 });
  return Response.json(po);
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const { status, expectedDate, notes } = await request.json();

  const po = await prisma.purchaseOrder.update({
    where: { id: Number(id) },
    data: {
      ...(status       != null && { status }),
      ...(expectedDate != null && { expectedDate: new Date(expectedDate) }),
      ...(notes        != null && { notes }),
    },
    include: { supplier: true, lines: { include: { part: true } } },
  });
  return Response.json(po);
}
