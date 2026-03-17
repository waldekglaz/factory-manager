import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Parts from "./pages/Parts";
import Products from "./pages/Products";
import Orders from "./pages/Orders";
import Schedule from "./pages/Schedule";

const NAV = [
  { to: "/",         icon: "🏠", label: "Dashboard"           },
  { to: "/parts",    icon: "🔩", label: "Materials / Parts"   },
  { to: "/products", icon: "📦", label: "Products"            },
  { to: "/orders",   icon: "📋", label: "Orders"              },
  { to: "/schedule", icon: "📅", label: "Production Schedule" },
];

export default function App() {
  return (
    <div className="layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          Factory <span>Manager</span>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              <span className="nav-icon">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* ── Main content ── */}
      <main className="main">
        <Routes>
          <Route path="/"         element={<Dashboard />} />
          <Route path="/parts"    element={<Parts />} />
          <Route path="/products" element={<Products />} />
          <Route path="/orders"   element={<Orders />} />
          <Route path="/schedule" element={<Schedule />} />
        </Routes>
      </main>
    </div>
  );
}
