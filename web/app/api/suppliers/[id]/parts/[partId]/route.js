import prisma from "@/lib/prisma";

export async function DELETE(request, { params }) {
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
