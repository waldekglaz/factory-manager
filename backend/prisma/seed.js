/**
 * Seed script — populates the database with realistic example data.
 *
 * Materials:  8 parts — stock defined entirely through location assignments
 * Products:   Electric Motor AC-3, Industrial Fan IF-600, Control Panel CP-12
 * Customers:  2 example customers
 * Suppliers:  2 example suppliers with parts linked
 * Locations:  4 storage locations (3 local + 1 remote supplier warehouse, 3-day delivery)
 *
 * Run:  node prisma/seed.js
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // ── Materials (Parts) ───────────────────────────────────────────────────────
  // currentStock = sum of all location assignments defined below.
  // U1: 300, WH: 200                   → 500 screws
  // U1: 12,  U3: 8                     → 20  bearings
  // U3: 2,   SupplierWH: 3 (remote)    → 5   housings
  // U1: 150, WH: 50                    → 200 copper wire
  // U1: 3                              → 3   PCBs
  // U3: 8                              → 8   fan blades
  // U1: 100, U3: 50                    → 150 capacitors
  // U3: 1,   SupplierWH: 3 (remote)    → 4   rotor cores
  const parts = await Promise.all([
    prisma.part.upsert({
      where:  { name: "Steel Screw M6" },
      update: {},
      create: { name: "Steel Screw M6",    currentStock: 500, minimumStock: 100, supplierLeadTime: 2,  unit: "pcs" },
    }),
    prisma.part.upsert({
      where:  { name: "Ball Bearing 6205" },
      update: {},
      create: { name: "Ball Bearing 6205", currentStock: 20,  minimumStock: 10,  supplierLeadTime: 7,  unit: "pcs" },
    }),
    prisma.part.upsert({
      where:  { name: "Motor Housing" },
      update: {},
      create: { name: "Motor Housing",     currentStock: 5,   minimumStock: 2,   supplierLeadTime: 14, unit: "pcs" },
    }),
    prisma.part.upsert({
      where:  { name: "Copper Wire 1mm" },
      update: {},
      create: { name: "Copper Wire 1mm",   currentStock: 200, minimumStock: 50,  supplierLeadTime: 5,  unit: "m"   },
    }),
    prisma.part.upsert({
      where:  { name: "Control PCB" },
      update: {},
      create: { name: "Control PCB",       currentStock: 3,   minimumStock: 5,   supplierLeadTime: 10, unit: "pcs" },
    }),
    prisma.part.upsert({
      where:  { name: "Fan Blade 300mm" },
      update: {},
      create: { name: "Fan Blade 300mm",   currentStock: 8,   minimumStock: 3,   supplierLeadTime: 6,  unit: "pcs" },
    }),
    prisma.part.upsert({
      where:  { name: "Capacitor 100uF" },
      update: {},
      create: { name: "Capacitor 100uF",   currentStock: 150, minimumStock: 30,  supplierLeadTime: 3,  unit: "pcs" },
    }),
    prisma.part.upsert({
      where:  { name: "Rotor Core" },
      update: {},
      create: { name: "Rotor Core",        currentStock: 4,   minimumStock: 2,   supplierLeadTime: 12, unit: "pcs" },
    }),
  ]);

  const p = Object.fromEntries(parts.map((x) => [x.name, x]));
  console.log(`  Created ${parts.length} materials`);

  // ── Products ────────────────────────────────────────────────────────────────
  // dailyCapacity = how many units can be produced per working day
  // BOM uses yield model: materialQty units of material make productsPerBatch products
  // scrapFactor = fractional waste padding (0.05 = order 5% extra)
  const motor = await prisma.product.upsert({
    where:  { name: "Electric Motor AC-3" },
    update: {},
    create: {
      name:          "Electric Motor AC-3",
      dailyCapacity: 10,
      description:   "3-phase AC induction motor, 2.2kW",
      finishedStock: 2, // 2 units already in warehouse
      productParts: {
        create: [
          // 12 screws per motor, 2% scrap
          { partId: p["Steel Screw M6"].id,    materialQty: 12, productsPerBatch: 1, scrapFactor: 0.02 },
          // 2 bearings per motor
          { partId: p["Ball Bearing 6205"].id,  materialQty: 2,  productsPerBatch: 1, scrapFactor: 0    },
          // 1 housing per motor
          { partId: p["Motor Housing"].id,      materialQty: 1,  productsPerBatch: 1, scrapFactor: 0    },
          // 15m wire per motor, 5% scrap (cutting waste)
          { partId: p["Copper Wire 1mm"].id,    materialQty: 15, productsPerBatch: 1, scrapFactor: 0.05 },
          // 1 rotor core per motor
          { partId: p["Rotor Core"].id,         materialQty: 1,  productsPerBatch: 1, scrapFactor: 0    },
          // 4 capacitors per motor
          { partId: p["Capacitor 100uF"].id,    materialQty: 4,  productsPerBatch: 1, scrapFactor: 0    },
        ],
      },
    },
  });

  const fan = await prisma.product.upsert({
    where:  { name: "Industrial Fan IF-600" },
    update: {},
    create: {
      name:          "Industrial Fan IF-600",
      dailyCapacity: 20,
      description:   "600mm industrial axial fan",
      finishedStock: 0,
      productParts: {
        create: [
          { partId: p["Steel Screw M6"].id,    materialQty: 8, productsPerBatch: 1, scrapFactor: 0    },
          { partId: p["Fan Blade 300mm"].id,    materialQty: 3, productsPerBatch: 1, scrapFactor: 0    },
          { partId: p["Ball Bearing 6205"].id,  materialQty: 1, productsPerBatch: 1, scrapFactor: 0    },
          { partId: p["Motor Housing"].id,      materialQty: 1, productsPerBatch: 1, scrapFactor: 0    },
        ],
      },
    },
  });

  const panel = await prisma.product.upsert({
    where:  { name: "Control Panel CP-12" },
    update: {},
    create: {
      name:          "Control Panel CP-12",
      dailyCapacity: 5,
      description:   "12-channel industrial control panel with PLC",
      finishedStock: 0,
      productParts: {
        create: [
          // 1 PCB sheet yields 2 control boards after cutting — scrap factor 3%
          { partId: p["Control PCB"].id,        materialQty: 1,  productsPerBatch: 2, scrapFactor: 0.03 },
          { partId: p["Capacitor 100uF"].id,    materialQty: 24, productsPerBatch: 1, scrapFactor: 0    },
          { partId: p["Copper Wire 1mm"].id,    materialQty: 30, productsPerBatch: 1, scrapFactor: 0.05 },
          { partId: p["Steel Screw M6"].id,     materialQty: 20, productsPerBatch: 1, scrapFactor: 0    },
        ],
      },
    },
  });

  console.log(`  Created products: ${motor.name}, ${fan.name}, ${panel.name}`);

  // ── Customers ───────────────────────────────────────────────────────────────
  const [cust1, cust2] = await Promise.all([
    prisma.customer.upsert({
      where:  { name: "Acme Manufacturing Ltd" },
      update: {},
      create: {
        name:    "Acme Manufacturing Ltd",
        email:   "procurement@acme.example.com",
        phone:   "+44 20 1234 5678",
        address: "14 Industrial Park\nBirmingham, B1 1AA\nUnited Kingdom",
        notes:   "Long-standing customer. Prefers delivery on Tuesdays.",
      },
    }),
    prisma.customer.upsert({
      where:  { name: "Northern Engineering Co." },
      update: {},
      create: {
        name:    "Northern Engineering Co.",
        email:   "orders@northeng.example.com",
        phone:   "+44 161 999 0000",
        address: "7 Mill Road\nManchester, M2 3DF\nUnited Kingdom",
      },
    }),
  ]);

  console.log(`  Created customers: ${cust1.name}, ${cust2.name}`);

  // ── Suppliers ───────────────────────────────────────────────────────────────
  const [sup1, sup2] = await Promise.all([
    prisma.supplier.upsert({
      where:  { name: "FastFix Components" },
      update: {},
      create: {
        name:            "FastFix Components",
        email:           "sales@fastfix.example.com",
        phone:           "+44 800 100 200",
        defaultLeadTime: 3,
        notes:           "Reliable for screws, bearings, and capacitors. Min order £50.",
      },
    }),
    prisma.supplier.upsert({
      where:  { name: "PrecisionParts UK" },
      update: {},
      create: {
        name:            "PrecisionParts UK",
        email:           "supply@precisionparts.example.com",
        phone:           "+44 800 300 400",
        defaultLeadTime: 10,
        notes:           "Specialist in motor housings and rotor cores. Long lead times but high quality.",
      },
    }),
  ]);

  console.log(`  Created suppliers: ${sup1.name}, ${sup2.name}`);

  // Link parts to suppliers (with optional cost and lead time overrides)
  await Promise.all([
    // FastFix supplies screws (2d lead time, £0.05 each) and bearings (5d, £3.20 each)
    prisma.supplierPart.upsert({
      where:  { supplierId_partId: { supplierId: sup1.id, partId: p["Steel Screw M6"].id } },
      update: {},
      create: { supplierId: sup1.id, partId: p["Steel Screw M6"].id,    unitCost: 0.05, leadTimeOverride: 2  },
    }),
    prisma.supplierPart.upsert({
      where:  { supplierId_partId: { supplierId: sup1.id, partId: p["Ball Bearing 6205"].id } },
      update: {},
      create: { supplierId: sup1.id, partId: p["Ball Bearing 6205"].id,  unitCost: 3.20, leadTimeOverride: 5  },
    }),
    prisma.supplierPart.upsert({
      where:  { supplierId_partId: { supplierId: sup1.id, partId: p["Capacitor 100uF"].id } },
      update: {},
      create: { supplierId: sup1.id, partId: p["Capacitor 100uF"].id,   unitCost: 0.18, leadTimeOverride: null },
    }),
    // PrecisionParts supplies housings and rotor cores
    prisma.supplierPart.upsert({
      where:  { supplierId_partId: { supplierId: sup2.id, partId: p["Motor Housing"].id } },
      update: {},
      create: { supplierId: sup2.id, partId: p["Motor Housing"].id,     unitCost: 42.0, leadTimeOverride: 14 },
    }),
    prisma.supplierPart.upsert({
      where:  { supplierId_partId: { supplierId: sup2.id, partId: p["Rotor Core"].id } },
      update: {},
      create: { supplierId: sup2.id, partId: p["Rotor Core"].id,        unitCost: 28.5, leadTimeOverride: 12 },
    }),
    // FastFix also supplies bearings (slower but cheaper alternative)
    prisma.supplierPart.upsert({
      where:  { supplierId_partId: { supplierId: sup2.id, partId: p["Ball Bearing 6205"].id } },
      update: {},
      create: { supplierId: sup2.id, partId: p["Ball Bearing 6205"].id,  unitCost: 2.90, leadTimeOverride: 8  },
    }),
  ]);

  console.log("  Linked parts to suppliers");

  // ── Locations ────────────────────────────────────────────────────────────────
  // 3 local locations + 1 remote supplier warehouse (3-day delivery).
  // Remote stock counts toward Part.currentStock but the planner adds deliveryDays
  // before treating it as available for production.
  const [locUnit1, locUnit3, locWarehouse, locSupplierWH] = await Promise.all([
    prisma.location.upsert({
      where:  { name: "Unit 1" },
      update: {},
      create: { name: "Unit 1",             code: "U1",   description: "Main production unit — shelving bays A–D",          isActive: true, isRemote: false },
    }),
    prisma.location.upsert({
      where:  { name: "Unit 3" },
      update: {},
      create: { name: "Unit 3",             code: "U3",   description: "Secondary production unit — overflow stock",         isActive: true, isRemote: false },
    }),
    prisma.location.upsert({
      where:  { name: "Warehouse" },
      update: {},
      create: { name: "Warehouse",          code: "WH",   description: "Finished goods and bulk raw materials",              isActive: true, isRemote: false },
    }),
    prisma.location.upsert({
      where:  { name: "Supplier Warehouse" },
      update: {},
      create: { name: "Supplier Warehouse", code: "SWH",  description: "PrecisionParts UK consignment stock — 3-day delivery", isActive: true, isRemote: true, deliveryDays: 3 },
    }),
  ]);

  console.log(`  Created locations: ${locUnit1.name}, ${locUnit3.name}, ${locWarehouse.name}, ${locSupplierWH.name} (remote)`);

  // Assign part stock to locations.
  // Local quantities are immediately available; remote quantities add deliveryDays to the plan.
  await Promise.all([
    // Steel Screw M6 — 300 in Unit 1, 200 in Warehouse (all local)
    prisma.partLocationStock.upsert({
      where:  { partId_locationId: { partId: p["Steel Screw M6"].id, locationId: locUnit1.id } },
      update: {},
      create: { partId: p["Steel Screw M6"].id, locationId: locUnit1.id, quantity: 300 },
    }),
    prisma.partLocationStock.upsert({
      where:  { partId_locationId: { partId: p["Steel Screw M6"].id, locationId: locWarehouse.id } },
      update: {},
      create: { partId: p["Steel Screw M6"].id, locationId: locWarehouse.id, quantity: 200 },
    }),

    // Ball Bearing 6205 — 12 in Unit 1, 8 in Unit 3 (all local)
    prisma.partLocationStock.upsert({
      where:  { partId_locationId: { partId: p["Ball Bearing 6205"].id, locationId: locUnit1.id } },
      update: {},
      create: { partId: p["Ball Bearing 6205"].id, locationId: locUnit1.id, quantity: 12 },
    }),
    prisma.partLocationStock.upsert({
      where:  { partId_locationId: { partId: p["Ball Bearing 6205"].id, locationId: locUnit3.id } },
      update: {},
      create: { partId: p["Ball Bearing 6205"].id, locationId: locUnit3.id, quantity: 8 },
    }),

    // Motor Housing — 2 in Unit 3 (local), 3 at Supplier Warehouse (remote, +3 days)
    prisma.partLocationStock.upsert({
      where:  { partId_locationId: { partId: p["Motor Housing"].id, locationId: locUnit3.id } },
      update: {},
      create: { partId: p["Motor Housing"].id, locationId: locUnit3.id, quantity: 2 },
    }),
    prisma.partLocationStock.upsert({
      where:  { partId_locationId: { partId: p["Motor Housing"].id, locationId: locSupplierWH.id } },
      update: {},
      create: { partId: p["Motor Housing"].id, locationId: locSupplierWH.id, quantity: 3 },
    }),

    // Copper Wire 1mm — 150 in Unit 1, 50 in Warehouse (all local)
    prisma.partLocationStock.upsert({
      where:  { partId_locationId: { partId: p["Copper Wire 1mm"].id, locationId: locUnit1.id } },
      update: {},
      create: { partId: p["Copper Wire 1mm"].id, locationId: locUnit1.id, quantity: 150 },
    }),
    prisma.partLocationStock.upsert({
      where:  { partId_locationId: { partId: p["Copper Wire 1mm"].id, locationId: locWarehouse.id } },
      update: {},
      create: { partId: p["Copper Wire 1mm"].id, locationId: locWarehouse.id, quantity: 50 },
    }),

    // Control PCB — all 3 in Unit 1 (ESD-safe shelf, local)
    prisma.partLocationStock.upsert({
      where:  { partId_locationId: { partId: p["Control PCB"].id, locationId: locUnit1.id } },
      update: {},
      create: { partId: p["Control PCB"].id, locationId: locUnit1.id, quantity: 3 },
    }),

    // Fan Blade 300mm — all 8 in Unit 3 (local)
    prisma.partLocationStock.upsert({
      where:  { partId_locationId: { partId: p["Fan Blade 300mm"].id, locationId: locUnit3.id } },
      update: {},
      create: { partId: p["Fan Blade 300mm"].id, locationId: locUnit3.id, quantity: 8 },
    }),

    // Capacitor 100uF — 100 in Unit 1, 50 in Unit 3 (all local)
    prisma.partLocationStock.upsert({
      where:  { partId_locationId: { partId: p["Capacitor 100uF"].id, locationId: locUnit1.id } },
      update: {},
      create: { partId: p["Capacitor 100uF"].id, locationId: locUnit1.id, quantity: 100 },
    }),
    prisma.partLocationStock.upsert({
      where:  { partId_locationId: { partId: p["Capacitor 100uF"].id, locationId: locUnit3.id } },
      update: {},
      create: { partId: p["Capacitor 100uF"].id, locationId: locUnit3.id, quantity: 50 },
    }),

    // Rotor Core — 1 in Unit 3 (local), 3 at Supplier Warehouse (remote, +3 days)
    prisma.partLocationStock.upsert({
      where:  { partId_locationId: { partId: p["Rotor Core"].id, locationId: locUnit3.id } },
      update: {},
      create: { partId: p["Rotor Core"].id, locationId: locUnit3.id, quantity: 1 },
    }),
    prisma.partLocationStock.upsert({
      where:  { partId_locationId: { partId: p["Rotor Core"].id, locationId: locSupplierWH.id } },
      update: {},
      create: { partId: p["Rotor Core"].id, locationId: locSupplierWH.id, quantity: 3 },
    }),
  ]);

  console.log("  Assigned part stock to locations");

  // Finished goods — 2 Electric Motors ready to ship in Warehouse
  await prisma.productLocationStock.upsert({
    where:  { productId_locationId: { productId: motor.id, locationId: locWarehouse.id } },
    update: {},
    create: { productId: motor.id, locationId: locWarehouse.id, quantity: 2 },
  });

  console.log("  Assigned finished goods to Warehouse");

  // ── Stock movements (history) ────────────────────────────────────────────────
  await prisma.stockMovement.createMany({
    data: [
      { partId: p["Steel Screw M6"].id,    quantity:  500, reason: "initial_stock"                     },
      { partId: p["Ball Bearing 6205"].id,  quantity:  20,  reason: "initial_stock"                     },
      { partId: p["Motor Housing"].id,      quantity:  10,  reason: "initial_stock"                     },
      { partId: p["Motor Housing"].id,      quantity:  -5,  reason: "production_order_#0 (historical)"  },
      { partId: p["Copper Wire 1mm"].id,    quantity:  200, reason: "initial_stock"                     },
      { partId: p["Control PCB"].id,        quantity:  5,   reason: "initial_stock"                     },
      { partId: p["Control PCB"].id,        quantity:  -2,  reason: "production_order_#0 (historical)"  },
    ],
  });

  // ── Finished goods movements (history) ──────────────────────────────────────
  await prisma.finishedGoodsMovement.createMany({
    data: [
      { productId: motor.id, quantity: 2, reason: "initial_stock" },
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
