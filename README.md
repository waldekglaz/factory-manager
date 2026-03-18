# Factory Manager

A local-first Stock Management and Production Planning system for small manufacturing businesses. Manage materials, products, customers, and suppliers — with automatic production scheduling based on stock availability and supplier lead times.

## Features

- **Materials & Stock** — track raw materials, stock levels, minimum thresholds, supplier lead times, and full movement audit log
- **Products & BOM** — define products with a yield-based Bill of Materials and optional scrap/waste factor per material
- **Storage Locations** — assign stock to named locations (Unit 1, Warehouse, etc.); mark locations as remote with a delivery time; the planner automatically factors in transit days for remote stock; transfer stock between locations
- **Customers** — manage customer details and view their full order history
- **Orders** — place orders with live production plan preview; stock is allocated immediately on creation
- **Finished Goods Inventory** — track finished units in the warehouse; orders automatically fulfil from stock before scheduling production
- **Procurement** — manage suppliers, link parts with cost and lead time overrides, create purchase orders, and receive deliveries (auto-recalculates waiting orders)
- **Production Schedule** — Gantt-style timeline of all active orders with deadline markers
- **Dashboard** — live overview: low stock alerts, active orders, available-to-ship count, overdue flagging
- **Working-day scheduling** — production end dates skip weekends (Mon–Fri only)
- **Multi-supplier lead times** — planner uses the shortest lead time across all linked suppliers
- **PDF Work Orders & Delivery Notes** — printable documents direct from any order (no extra dependencies)
- **Database backup** — one-click download from the dashboard, or CLI script

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Backend  | Node.js, Express, Prisma ORM      |
| Database | SQLite (local file)               |
| Frontend | React 18, Vite, React Router 6    |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### 1. Clone the repository

```bash
git clone https://github.com/waldekglaz/factory-manager.git
cd factory-manager
```

### 2. Set up the backend

```bash
cd backend
npm install
npx prisma migrate dev --name init   # creates the SQLite database
```

Optionally load example data (8 materials, 3 products, 2 customers, 2 suppliers, 4 locations):

```bash
node prisma/seed.js
```

### 3. Set up the frontend

```bash
cd ../frontend
npm install
```

### 4. Run the app

Open two terminals:

```bash
# Terminal 1 — API server (http://localhost:3001)
cd backend
npm run dev

# Terminal 2 — Frontend (http://localhost:5173)
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## How It Works

### Stock allocation

When an order is placed, available stock is **immediately deducted** from the warehouse. `currentStock` always reflects free, unallocated stock. If an order is cancelled, the allocated stock is returned automatically.

### Finished goods

If a product has units already in the warehouse (`finishedStock > 0`), the system fulfils as many as possible from stock before scheduling any production. The `finishedStock` is deducted at order creation and returned on cancellation.

### Storage locations

`Part.currentStock` is the planning total used by the production planner. Locations add a physical layer on top: `PartLocationStock` tracks how many units of a part are in each named location. Stock is entered through location assignments — the total is computed as the sum of all location quantities.

A location can be marked **remote** with a delivery time in calendar days. This is used for stock held at a supplier's warehouse, a third-party logistics provider, or any off-site store. The planner splits local vs remote stock per part:

| Stock available | Production start |
|---|---|
| Local stock covers the order | Today |
| Need to pull from remote location(s) | Today + max delivery days of remote locations used |
| Not enough stock anywhere | Today + supplier lead time |

Stock managers use the **Locations** page to:
- Set up local or remote storage locations with an optional short code
- Mark a location as remote and set its delivery time in days
- See the full stock breakdown per location (all parts and finished goods stored there)
- Transfer stock between locations

### Production planning algorithm

For each material in the BOM:

| Condition | Result |
|---|---|
| Finished goods ≥ order qty | No production needed — fulfilled from stock |
| Local stock ≥ needed | Available today |
| Total stock ≥ needed (some remote) | Available in `today + max(remote deliveryDays)` |
| Total stock < needed | Available in `today + supplierLeadTime` |

```
effectiveQty    = orderQty − fulfilledFromStock
quantityNeeded  = ceil(materialQty × effectiveQty / productsPerBatch × (1 + scrapFactor))
productionStart = latest availableDate across all materials
productionDays  = ceil(effectiveQty / dailyCapacity)
productionEnd   = productionStart + productionDays  (working days only, Mon–Fri)
```

If multiple suppliers are linked to a part, the planner uses the **shortest available lead time** automatically.

### BOM yield model

Materials are defined by a ratio: **"N units of material makes M products"**, with an optional scrap factor.

| Material | Qty | Per N products | Scrap | Consumed per product |
|---|---|---|---|---|
| Sheet of HPL | 1 | 5 | 0% | 0.2 sheets |
| Copper Wire | 15 m | 1 | 5% | 15.75 m |
| Box | 1 | 1 | 0% | 1 box |

### Procurement flow

1. Create a supplier and link the parts they supply (with optional unit cost and lead time override)
2. Create a Purchase Order for a supplier with part lines
3. When delivery arrives, click **Receive** — enter quantities received
4. Stock updates atomically; any `planned` orders waiting for those parts are **automatically recalculated**

---

## Project Structure

```
factory-manager/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma           # Full database schema
│   │   ├── migrations/             # Migration history
│   │   └── seed.js                 # Example data (materials, products, customers, suppliers, locations)
│   ├── scripts/
│   │   └── backup.js               # Database backup script
│   └── src/
│       ├── index.js                # Express server (port 3001)
│       ├── routes/
│       │   ├── dashboard.js        # Dashboard summary endpoint
│       │   ├── parts.js            # Materials CRUD + stock movements
│       │   ├── products.js         # Products CRUD + BOM management
│       │   ├── orders.js           # Orders lifecycle + stock allocation
│       │   ├── customers.js        # Customers CRUD + order history
│       │   ├── procurement.js      # Suppliers, SupplierParts, PurchaseOrders + receive
│       │   ├── locations.js        # Storage locations CRUD + stock view + transfers
│       │   └── print.js            # HTML work order and delivery note
│       └── services/
│           └── productionPlanner.js  # Core planning algorithm
└── frontend/
    └── src/
        ├── api.js                  # API client (fetch wrapper)
        ├── App.jsx                 # Layout + routing
        ├── styles.css
        └── pages/
            ├── Dashboard.jsx
            ├── Parts.jsx
            ├── Products.jsx
            ├── Customers.jsx
            ├── Orders.jsx
            ├── Procurement.jsx
            ├── Locations.jsx
            └── Schedule.jsx
```

---

## Database Schema

| Model | Key fields |
|---|---|
| `Part` | name, currentStock, minimumStock, supplierLeadTime, unit |
| `Product` | name, dailyCapacity, description, finishedStock |
| `ProductPart` | materialQty, productsPerBatch, scrapFactor |
| `Customer` | name, email, phone, address, notes |
| `Order` | productId, customerId, quantity, status, productionStartDate, productionEndDate, fulfilledFromStock |
| `OrderPart` | snapshot of part requirements at order creation |
| `Location` | name, code, description, isActive, isRemote, deliveryDays |
| `PartLocationStock` | partId, locationId, quantity — units of a part stored at a location |
| `ProductLocationStock` | productId, locationId, quantity — finished goods stored at a location |
| `StockMovement` | partId, locationId?, quantity (±), reason — full audit log |
| `FinishedGoodsMovement` | productId, locationId?, quantity (±), reason |
| `Supplier` | name, email, phone, defaultLeadTime |
| `SupplierPart` | supplierId, partId, unitCost, leadTimeOverride |
| `PurchaseOrder` | supplierId, status, expectedDate |
| `PurchaseOrderLine` | partId, quantityOrdered, quantityReceived |

---

## Database Backup

**From the UI:** click **Backup DB** on the Dashboard — downloads the file and saves a copy to `backend/data/backups/`.

**From the terminal:**

```bash
cd backend
npm run db:backup
# → backend/data/backups/factory_2026-03-18_14-30-00.db
```

**Schedule automatic backups** (macOS/Linux) — runs every weekday at 08:00:

```bash
crontab -e
# add:
0 8 * * 1-5 cd /path/to/factory-manager/backend && npm run db:backup
```

**Restore from backup:**

```bash
# Stop the server first, then:
cp backend/data/backups/factory_2026-03-18_14-30-00.db backend/data/factory.db
```

The script keeps the 30 most recent backups and deletes older ones automatically.

---

## API Endpoints

### Dashboard
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard` | Summary: stats, alerts, active orders, available to ship |

### Materials (Parts)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/parts` | List all materials (includes location stock breakdown) |
| POST | `/api/parts` | Create material |
| PUT | `/api/parts/:id` | Update material |
| DELETE | `/api/parts/:id` | Delete material |
| GET | `/api/parts/:id/movements` | Stock movement history |

### Products
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/products` | List all products with BOM |
| POST | `/api/products` | Create product + BOM |
| PUT | `/api/products/:id` | Update product + replace BOM |
| DELETE | `/api/products/:id` | Delete product |

### Customers
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/customers` | List all customers |
| POST | `/api/customers` | Create customer |
| PUT | `/api/customers/:id` | Update customer |
| DELETE | `/api/customers/:id` | Delete customer |
| GET | `/api/customers/:id/orders` | Order history for a customer |

### Orders
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/orders` | List all orders |
| POST | `/api/orders` | Place order (runs planning, allocates stock) |
| GET | `/api/orders/:id` | Order detail |
| POST | `/api/orders/:id/start` | Start production |
| POST | `/api/orders/:id/recalculate` | Re-plan with current stock |
| POST | `/api/orders/:id/complete` | Mark completed |
| POST | `/api/orders/:id/cancel` | Cancel (returns stock) |
| GET | `/api/orders/:id/work-order` | Printable work order (HTML) |
| GET | `/api/orders/:id/delivery-note` | Printable delivery note (HTML) |

### Locations
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/locations` | List all locations with stock summary |
| POST | `/api/locations` | Create location |
| PUT | `/api/locations/:id` | Update location (name, code, description, isActive) |
| DELETE | `/api/locations/:id` | Delete location (only if empty) |
| GET | `/api/locations/:id/stock` | Full stock breakdown for one location |
| POST | `/api/locations/transfer/parts` | Move part stock between locations |
| POST | `/api/locations/transfer/products` | Move finished goods between locations |

### Procurement
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/suppliers` | List all suppliers with linked parts |
| POST | `/api/suppliers` | Create supplier |
| PUT | `/api/suppliers/:id` | Update supplier |
| DELETE | `/api/suppliers/:id` | Delete supplier |
| POST | `/api/suppliers/:id/parts` | Link a part to a supplier |
| DELETE | `/api/suppliers/:id/parts/:partId` | Unlink a part |
| GET | `/api/purchase-orders` | List all purchase orders |
| POST | `/api/purchase-orders` | Create purchase order |
| GET | `/api/purchase-orders/:id` | Purchase order detail |
| PUT | `/api/purchase-orders/:id` | Update status / expected date |
| POST | `/api/purchase-orders/:id/receive` | Receive delivery (updates stock) |

### Misc
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/backup/download` | Download database file |
