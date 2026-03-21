"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const MANAGER_NAV = [
  { to: "/dashboard",   icon: "🏠", label: "Dashboard"           },
  { to: "/parts",       icon: "🔩", label: "Materials / Parts"   },
  { to: "/products",    icon: "📦", label: "Products"            },
  { to: "/locations",   icon: "🏭", label: "Locations"           },
  { to: "/customers",   icon: "👥", label: "Customers"           },
  { to: "/orders",      icon: "📋", label: "Orders"              },
  { to: "/procurement", icon: "🚚", label: "Procurement"         },
  { to: "/schedule",    icon: "📅", label: "Production Schedule" },
  { to: "/users",       icon: "👤", label: "Users"               },
];

const ADMIN_NAV = [
  { to: "/dashboard",   icon: "🏠", label: "Dashboard"   },
  { to: "/customers",   icon: "👥", label: "Customers"   },
  { to: "/orders",      icon: "📋", label: "Orders"      },
  { to: "/procurement", icon: "🚚", label: "Procurement" },
];

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [role, setRole] = useState("manager");

  useEffect(() => {
    const supabase = getSupabase();
    let channel;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

      setRole(user.user_metadata?.role ?? "manager");

      channel = supabase.channel("online-users");
      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          const users = Object.values(state).flat();
          setOnlineUsers(users);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({ email: user.email });
          }
        });
    });

    return () => { channel?.unsubscribe(); };
  }, []);

  const handleLogout = async () => {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const nav = role === "admin" ? ADMIN_NAV : MANAGER_NAV;

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        Factory <span>Manager</span>
      </div>
      <nav className="sidebar-nav">
        {nav.map(({ to, icon, label }) => (
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

      {onlineUsers.length > 0 && (
        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", marginTop: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
            <span style={{ color: "#22c55e", marginRight: 4 }}>●</span>
            {onlineUsers.length} online
          </div>
          {onlineUsers.map((u, i) => (
            <div key={i} style={{ fontSize: 12, color: "var(--muted)", padding: "2px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {u.email?.split("@")[0]}
            </div>
          ))}
        </div>
      )}

      <button className="nav-link" onClick={handleLogout} style={{ background: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "left" }}>
        <span className="nav-icon">🚪</span>
        Log out
      </button>
    </aside>
  );
}
