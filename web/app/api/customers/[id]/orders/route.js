import prisma from "@/lib/prisma";
import { requireAuth, MANAGER_ADMIN } from "@/lib/auth";

export async function GET(request, { params }) {
  const auth = await requireAuth(request, MANAGER_ADMIN);
  if (auth.error) return auth.error;
  const { id } = await params;
  const orders = await prisma.order.findMany({
    where:   { customerId: Number(id) },
    orderBy: { createdAt: "desc" },
    include: { product: true },
  });
  return Response.json(orders);
}
