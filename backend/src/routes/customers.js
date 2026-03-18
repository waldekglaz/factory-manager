/**
 * Customers Routes
 *
 * GET    /api/customers          → list all customers
 * POST   /api/customers          → create customer
 * PUT    /api/customers/:id      → update customer
 * DELETE /api/customers/:id      → delete customer (only if no orders linked)
 * GET    /api/customers/:id/orders → order history for a customer
 */

const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

router.get("/", async (req, res) => {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { orders: true } } },
  });
  res.json(customers);
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json(customer);
});

router.get("/:id/orders", async (req, res) => {
  const id = Number(req.params.id);
  const orders = await prisma.order.findMany({
    where:   { customerId: id },
    orderBy: { createdAt: "desc" },
    include: { product: true },
  });
  res.json(orders);
});

router.post("/", async (req, res) => {
  const { name, email, phone, address, notes } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const customer = await prisma.customer.create({
    data: {
      name:    name.trim(),
      email:   email   ?? null,
      phone:   phone   ?? null,
      address: address ?? null,
      notes:   notes   ?? "",
    },
  });
  res.status(201).json(customer);
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, email, phone, address, notes } = req.body;

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      ...(name    != null && { name:    name.trim() }),
      ...(email   != null && { email }),
      ...(phone   != null && { phone }),
      ...(address != null && { address }),
      ...(notes   != null && { notes }),
    },
  });
  res.json(customer);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);

  const orderCount = await prisma.order.count({
    where: { customerId: id, status: { not: "cancelled" } },
  });
  if (orderCount > 0) {
    return res.status(409).json({
      error: `Customer has ${orderCount} active order(s). Cancel them first.`,
    });
  }

  // Unlink cancelled orders before deleting
  await prisma.order.updateMany({
    where: { customerId: id },
    data:  { customerId: null },
  });
  await prisma.customer.delete({ where: { id } });
  res.json({ message: "Customer deleted" });
});

module.exports = router;
