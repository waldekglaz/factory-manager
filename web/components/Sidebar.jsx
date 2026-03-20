"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

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
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    await supabase.auth.signOut();
    router.push("/login");
  };

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
      <button className="nav-link" onClick={handleLogout} style={{ marginTop: "auto", background: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "left" }}>
        <span className="nav-icon">🚪</span>
        Log out
      </button>
    </aside>
  );
}
