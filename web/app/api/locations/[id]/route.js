import prisma from "@/lib/prisma";

export async function PUT(request, { params }) {
  const { id } = await params;
  const { name, code, description, isActive, isRemote, deliveryDays } = await request.json();

  const location = await prisma.location.update({
    where: { id: Number(id) },
    data: {
      ...(name        != null     && { name:        name.trim() }),
      ...(code        !== undefined && { code:      code ? code.trim() : null }),
      ...(description != null     && { description }),
      ...(isActive    != null     && { isActive }),
      ...(isRemote    != null     && { isRemote:    Boolean(isRemote) }),
      ...(deliveryDays !== undefined && {
        deliveryDays: deliveryDays != null ? Number(deliveryDays) : null,
      }),
    },
  });
  return Response.json(location);
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const numId = Number(id);

  const partStock = await prisma.partLocationStock.aggregate({
    where: { locationId: numId },
    _sum:  { quantity: true },
  });
  const productStock = await prisma.productLocationStock.aggregate({
    where: { locationId: numId },
    _sum:  { quantity: true },
  });

  const totalStock = (partStock._sum.quantity ?? 0) + (productStock._sum.quantity ?? 0);
  if (totalStock > 0) {
    return Response.json(
      { error: `Location still holds ${totalStock} unit(s). Transfer or remove all stock first.` },
      { status: 409 }
    );
  }

  await prisma.location.delete({ where: { id: numId } });
  return Response.json({ message: "Location deleted" });
}
