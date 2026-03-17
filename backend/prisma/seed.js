/**
 * Seed script — populates the database with realistic example data.
 *
 * Parts:    screws, bearings, motor housing, copper wire, PCB, fan blade
 * Products: Electric Motor, Industrial Fan, Control Panel
 *
 * Run:  node prisma/seed.js
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // ── Parts ──────────────────────────────────────────────────────────────────
  const parts = await Promise.all([
    prisma.part.upsert({
      where: { name: "Steel Screw M6" },
      update: {},
      create: { name: "Steel Screw M6",    currentStock: 500, minimumStock: 100, supplierLeadTime: 2,  unit: "pcs" },
    }),
    prisma.part.upsert({
      where: { name: "Ball Bearing 6205" },
      update: {},
      create: { name: "Ball Bearing 6205", currentStock: 20,  minimumStock: 10,  supplierLeadTime: 7,  unit: "pcs" },
    }),
    prisma.part.upsert({
      where: { name: "Motor Housing" },
      update: {},
      create: { name: "Motor Housing",     currentStock: 5,   minimumStock: 2,   supplierLeadTime: 14, unit: "pcs" },
    }),
    prisma.part.upsert({
      where: { name: "Copper Wire 1mm" },
      update: {},
      create: { name: "Copper Wire 1mm",   currentStock: 200, minimumStock: 50,  supplierLeadTime: 5,  unit: "m"   },
    }),
    prisma.part.upsert({
      where: { name: "Control PCB" },
      update: {},
      create: { name: "Control PCB",       currentStock: 3,   minimumStock: 5,   supplierLeadTime: 10, unit: "pcs" },
    }),
    prisma.part.upsert({
      where: { name: "Fan Blade 300mm" },
      update: {},
      create: { name: "Fan Blade 300mm",   currentStock: 8,   minimumStock: 3,   supplierLeadTime: 6,  unit: "pcs" },
    }),
    prisma.part.upsert({
      where: { name: "Capacitor 100uF" },
      update: {},
      create: { name: "Capacitor 100uF",   currentStock: 150, minimumStock: 30,  supplierLeadTime: 3,  unit: "pcs" },
    }),
    prisma.part.upsert({
      where: { name: "Rotor Core" },
      update: {},
      create: { name: "Rotor Core",        currentStock: 4,   minimumStock: 2,   supplierLeadTime: 12, unit: "pcs" },
    }),
  ]);

  const byName = Object.fromEntries(parts.map((p) => [p.name, p]));
  console.log(`  Created ${parts.length} parts`);

  // ── Products ───────────────────────────────────────────────────────────────
  const motorProduct = await prisma.product.upsert({
    where: { name: "Electric Motor AC-3" },
    update: {},
    create: {
      name: "Electric Motor AC-3",
      productionTime: 3, // 3 days to manufacture
      description: "3-phase AC induction motor, 2.2kW",
      productParts: {
        create: [
          { partId: byName["Steel Screw M6"].id,    quantityRequired: 12 },
          { partId: byName["Ball Bearing 6205"].id,  quantityRequired: 2  },
          { partId: byName["Motor Housing"].id,      quantityRequired: 1  },
          { partId: byName["Copper Wire 1mm"].id,    quantityRequired: 15 },
          { partId: byName["Rotor Core"].id,         quantityRequired: 1  },
          { partId: byName["Capacitor 100uF"].id,    quantityRequired: 4  },
        ],
      },
    },
  });

  const fanProduct = await prisma.product.upsert({
    where: { name: "Industrial Fan IF-600" },
    update: {},
    create: {
      name: "Industrial Fan IF-600",
      productionTime: 2, // 2 days
      description: "600mm industrial axial fan",
      productParts: {
        create: [
          { partId: byName["Steel Screw M6"].id,    quantityRequired: 8  },
          { partId: byName["Fan Blade 300mm"].id,    quantityRequired: 3  },
          { partId: byName["Ball Bearing 6205"].id,  quantityRequired: 1  },
          { partId: byName["Motor Housing"].id,      quantityRequired: 1  },
        ],
      },
    },
  });

  const panelProduct = await prisma.product.upsert({
    where: { name: "Control Panel CP-12" },
    update: {},
    create: {
      name: "Control Panel CP-12",
      productionTime: 5, // 5 days (complex assembly)
      description: "12-channel industrial control panel with PLC",
      productParts: {
        create: [
          { partId: byName["Control PCB"].id,        quantityRequired: 2  },
          { partId: byName["Capacitor 100uF"].id,    quantityRequired: 24 },
          { partId: byName["Copper Wire 1mm"].id,    quantityRequired: 30 },
          { partId: byName["Steel Screw M6"].id,     quantityRequired: 20 },
        ],
      },
    },
  });

  console.log(`  Created products: ${motorProduct.name}, ${fanProduct.name}, ${panelProduct.name}`);

  // ── Example stock movements (history) ─────────────────────────────────────
  await prisma.stockMovement.createMany({
    data: [
      { partId: byName["Steel Screw M6"].id,   quantity: 500,  reason: "initial_stock" },
      { partId: byName["Ball Bearing 6205"].id, quantity: 20,  reason: "initial_stock" },
      { partId: byName["Motor Housing"].id,     quantity: 10,  reason: "initial_stock" },
      { partId: byName["Motor Housing"].id,     quantity: -5,  reason: "production_order_#0 (historical)" },
      { partId: byName["Copper Wire 1mm"].id,   quantity: 200, reason: "initial_stock" },
      { partId: byName["Control PCB"].id,       quantity: 5,   reason: "initial_stock" },
      { partId: byName["Control PCB"].id,       quantity: -2,  reason: "production_order_#0 (historical)" },
    ],
  });

  console.log("  Created stock movement history");
  console.log("\nSeed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
