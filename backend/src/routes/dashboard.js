/**
 * Dashboard Route
 * Single endpoint that returns everything the manager needs at a glance.
 *
 * GET /api/dashboard
 */

const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

router.get("/", async (req, res) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  const [
    allParts,
    orderCounts,
    inProductionOrders,
    plannedOrders,
    recentlyCompleted,
    productsInStock,
  ] = await Promise.all([
    // All parts — we'll derive low-stock and out-of-stock from this
    prisma.part.findMany({ orderBy: { name: "asc" } }),

    // Count of orders grouped by status
    prisma.order.groupBy({
      by: ["status"],
      _count: { id: true },
    }),

    // Orders currently in production — show end dates
    prisma.order.findMany({
      where: { status: "in_production" },
      include: { product: true },
      orderBy: { productionEndDate: "asc" },
    }),

    // Planned orders — show start dates, flag those starting within 7 days
    prisma.order.findMany({
      where: { status: "planned" },
      include: {
        product: true,
        orderParts: { include: { part: true } },
      },
      orderBy: { productionStartDate: "asc" },
    }),

    // Last 5 completed orders
    prisma.order.findMany({
      where: { status: "completed" },
      include: { product: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),

    // Products with finished goods in stock
    prisma.product.findMany({
      where: { finishedStock: { gt: 0 } },
      select: { id: true, name: true, finishedStock: true },
    }),
  ]);

  // ── Derive stock alerts ──────────────────────────────────────────────────
  const outOfStock = allParts.filter((p) => p.currentStock === 0);
  const lowStock   = allParts.filter(
    (p) => p.minimumStock != null && p.currentStock > 0 && p.currentStock <= p.minimumStock
  );

  // ── Order status summary map ─────────────────────────────────────────────
  const statusMap = Object.fromEntries(
    orderCounts.map((r) => [r.status, r._count.id])
  );

  // ── Flag planned orders starting within 7 days ───────────────────────────
  const plannedWithFlags = plannedOrders.map((o) => ({
    ...o,
    startingSoon: o.productionStartDate && new Date(o.productionStartDate) <= weekFromNow,
    hasShortage:  o.orderParts.some((op) => op.quantityMissing > 0),
  }));

  // ── Flag in-production orders finishing within 7 days ────────────────────
  const inProductionWithFlags = inProductionOrders.map((o) => ({
    ...o,
    endingSoon:   o.productionEndDate && new Date(o.productionEndDate) <= weekFromNow,
    overdue:      o.productionEndDate && new Date(o.productionEndDate) < today,
  }));

  res.json({
    stats: {
      planned:       statusMap["planned"]       ?? 0,
      inProduction:  statusMap["in_production"] ?? 0,
      completed:     statusMap["completed"]     ?? 0,
      cancelled:     statusMap["cancelled"]     ?? 0,
      outOfStock:    outOfStock.length,
      lowStock:      lowStock.length,
      totalParts:    allParts.length,
    },
    alerts: {
      outOfStock,
      lowStock,
    },
    inProductionOrders: inProductionWithFlags,
    plannedOrders:      plannedWithFlags,
    recentlyCompleted,
    availableToShip:    productsInStock.length,
    productsInStock,
  });
});

module.exports = router;
