import prisma from "@/lib/prisma";

export async function GET(request, { params }) {
  const { id } = await params;
  const movements = await prisma.stockMovement.findMany({
    where:   { partId: Number(id) },
    orderBy: { createdAt: "desc" },
    take:    50,
  });
  return Response.json(movements);
}
