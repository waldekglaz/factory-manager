# Factory Manager

A local-first Stock Management and Production Planning system. Manage materials, products, and orders — with automatic production scheduling based on stock availability and supplier lead times.

## Features

- **Materials & Stock** — track raw materials, stock levels, minimum thresholds, and supplier lead times
- **Products** — define products with a Bill of Materials (BOM) using a yield model (e.g. 1 sheet makes 5 units)
- **Orders** — place orders with automatic production planning; stock is allocated immediately on order creation
- **Production Schedule** — Gantt-style timeline of all active orders
- **Dashboard** — live overview: low stock alerts, active orders, production status
- **Working-day scheduling** — production end dates skip weekends (Mon–Fri only)
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

Optionally load example data:

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

### Production planning algorithm

For each material in the BOM:

| Condition | Result |
|---|---|
| Stock ≥ needed | Available today |
| Stock < needed | Available in `today + supplierLeadTime` days |

```
productionStart = latest availableDate across all materials
productionDays  = ceil(orderQty / dailyCapacity)
productionEnd   = productionStart + productionDays  (working days only, Mon–Fri)
```

### BOM yield model

Materials are defined by a ratio: **"N units of material makes M products"**.

| Material | Qty | Per N products | Consumed per product |
|---|---|---|---|
| Sheet of HPL | 1 | 5 | 0.2 sheets |
| Box | 1 | 1 | 1 box |
| Pin | 4 | 1 | 4 pins |

---

## Project Structure

```
factory-manager/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema
│   │   ├── migrations/         # Migration history
│   │   └── seed.js             # Example data
│   ├── scripts/
│   │   └── backup.js           # Database backup script
│   └── src/
│       ├── index.js            # Express server (port 3001)
│       ├── routes/
│       │   ├── dashboard.js
│       │   ├── parts.js
│       │   ├── products.js
│       │   └── orders.js
│       └── services/
│           └── productionPlanner.js  # Core planning logic
└── frontend/
    └── src/
        ├── api.js              # API client
        ├── App.jsx             # Layout + routing
        ├── styles.css
        └── pages/
            ├── Dashboard.jsx
            ├── Parts.jsx
            ├── Products.jsx
            ├── Orders.jsx
            └── Schedule.jsx
```

---

## Database Backup

**From the UI:** click **Backup DB** on the Dashboard — downloads the file and saves a copy to `backend/data/backups/`.

**From the terminal:**

```bash
cd backend
npm run db:backup
# → backend/data/backups/factory_2026-03-17_14-30-00.db
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
cp backend/data/backups/factory_2026-03-17_14-30-00.db backend/data/factory.db
```

The script keeps the 30 most recent backups and deletes older ones automatically.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard` | Dashboard summary |
| GET/POST | `/api/parts` | List / create materials |
| PUT/DELETE | `/api/parts/:id` | Update / delete material |
| GET/POST | `/api/products` | List / create products |
| PUT/DELETE | `/api/products/:id` | Update / delete product |
| GET/POST | `/api/orders` | List / place order |
| POST | `/api/orders/:id/start` | Start production |
| POST | `/api/orders/:id/recalculate` | Re-plan with current stock |
| POST | `/api/orders/:id/complete` | Mark completed |
| POST | `/api/orders/:id/cancel` | Cancel (returns stock) |
| GET | `/api/backup/download` | Download database file |
