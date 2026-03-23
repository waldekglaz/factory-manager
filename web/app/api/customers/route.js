import prisma from "@/lib/prisma";
import { requireAuth, MANAGER_ADMIN, MANAGER_ONLY } from "@/lib/auth";

export async function GET(request) {
  const auth = await requireAuth(request, MANAGER_ADMIN);
  if (auth.error) return auth.error;
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { orders: true } } },
  });
  return Response.json(customers);
}

export async function POST(request) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;

  const { name, email, phone, address, notes } = await request.json();
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  const customer = await prisma.customer.create({
    data: {
      name:    name.trim(),
      email:   email   ?? null,
      phone:   phone   ?? null,
      address: address ?? null,
      notes:   notes   ?? "",
    },
  });
  return Response.json(customer, { status: 201 });
}
