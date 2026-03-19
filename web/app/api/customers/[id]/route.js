import prisma from "@/lib/prisma";

export async function GET(request, { params }) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id: Number(id) } });
  if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });
  return Response.json(customer);
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const { name, email, phone, address, notes } = await request.json();

  const customer = await prisma.customer.update({
    where: { id: Number(id) },
    data: {
      ...(name    != null && { name: name.trim() }),
      ...(email   != null && { email }),
      ...(phone   != null && { phone }),
      ...(address != null && { address }),
      ...(notes   != null && { notes }),
    },
  });
  return Response.json(customer);
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const numId = Number(id);

  const orderCount = await prisma.order.count({
    where: { customerId: numId, status: { not: "cancelled" } },
  });
  if (orderCount > 0) {
    return Response.json(
      { error: `Customer has ${orderCount} active order(s). Cancel them first.` },
      { status: 409 }
    );
  }

  await prisma.order.updateMany({ where: { customerId: numId }, data: { customerId: null } });
  await prisma.customer.delete({ where: { id: numId } });
  return Response.json({ message: "Customer deleted" });
}
