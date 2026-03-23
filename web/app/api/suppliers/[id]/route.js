import prisma from "@/lib/prisma";
import { requireAuth, MANAGER_ONLY } from "@/lib/auth";

export async function PUT(request, { params }) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;
  const { id } = await params;
  const { name, email, phone, defaultLeadTime, notes } = await request.json();

  const supplier = await prisma.supplier.update({
    where: { id: Number(id) },
    data: {
      ...(name            != null && { name: name.trim() }),
      ...(email           != null && { email }),
      ...(phone           != null && { phone }),
      ...(defaultLeadTime != null && { defaultLeadTime: Number(defaultLeadTime) }),
      ...(notes           != null && { notes }),
    },
  });
  return Response.json(supplier);
}

export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;

  const { id } = await params;
  const numId = Number(id);

  const poCount = await prisma.purchaseOrder.count({ where: { supplierId: numId } });
  if (poCount > 0) {
    return Response.json(
      { error: `Supplier has ${poCount} purchase order(s). Cannot delete.` },
      { status: 409 }
    );
  }

  await prisma.supplier.delete({ where: { id: numId } });
  return Response.json({ message: "Supplier deleted" });
}
