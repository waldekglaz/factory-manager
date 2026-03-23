import prisma from "@/lib/prisma";
import { requireAuth, MANAGER_ONLY } from "@/lib/auth";

export async function GET(request, { params }) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;
  const { id } = await params;
  const movements = await prisma.stockMovement.findMany({
    where:   { partId: Number(id) },
    orderBy: { createdAt: "desc" },
    take:    50,
  });
  return Response.json(movements);
}
