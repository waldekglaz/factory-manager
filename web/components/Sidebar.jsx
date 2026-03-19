"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { to: "/dashboard",   icon: "🏠", label: "Dashboard"           },
  { to: "/parts",       icon: "🔩", label: "Materials / Parts"   },
  { to: "/products",    icon: "📦", label: "Products"            },
  { to: "/locations",   icon: "🏭", label: "Locations"           },
  { to: "/customers",   icon: "👥", label: "Customers"           },
  { to: "/orders",      icon: "📋", label: "Orders"              },
  { to: "/procurement", icon: "🚚", label: "Procurement"         },
  { to: "/schedule",    icon: "📅", label: "Production Schedule" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        Factory <span>Manager</span>
      </div>
      <nav className="sidebar-nav">
        {NAV.map(({ to, icon, label }) => (
          <Link
            key={to}
            href={to}
            className={`nav-link${pathname === to || (to !== "/dashboard" && pathname.startsWith(to)) ? " active" : ""}`}
          >
            <span className="nav-icon">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
