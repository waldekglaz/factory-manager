import prisma from "@/lib/prisma";
import { requireAuth, MANAGER_ONLY } from "@/lib/auth";

export async function GET(request) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: {
      supplierParts: { include: { part: true } },
      _count: { select: { purchaseOrders: true } },
    },
  });
  return Response.json(suppliers);
}

export async function POST(request) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;

  const { name, email, phone, defaultLeadTime, notes } = await request.json();
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  const supplier = await prisma.supplier.create({
    data: {
      name:            name.trim(),
      email:           email           ?? null,
      phone:           phone           ?? null,
      defaultLeadTime: Number(defaultLeadTime ?? 7),
      notes:           notes           ?? "",
    },
  });
  return Response.json(supplier, { status: 201 });
}
