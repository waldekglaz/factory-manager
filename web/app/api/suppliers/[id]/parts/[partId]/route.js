import prisma from "@/lib/prisma";
import { requireAuth, MANAGER_ONLY } from "@/lib/auth";

export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;
  const { id, partId } = await params;

  await prisma.supplierPart.delete({
    where: {
      supplierId_partId: {
        supplierId: Number(id),
        partId:     Number(partId),
      },
    },
  });
  return Response.json({ message: "Part unlinked from supplier" });
}
