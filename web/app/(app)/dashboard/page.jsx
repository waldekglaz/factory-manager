"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function daysUntil(d) {
  const diff = Math.round((new Date(d) - new Date()) / 86400000);
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, cls: "danger" };
  if (diff === 0) return { label: "today",                      cls: "warning" };
  if (diff === 1) return { label: "tomorrow",                   cls: "warning" };
  return           { label: `in ${diff}d`,                     cls: "muted"   };
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${color ? color + "40" : "var(--border)"}`,
      borderLeft: `4px solid ${color ?? "var(--border)"}`,
      borderRadius: "var(--radius)",
      padding: "16px 20px",
      flex: 1,
      minWidth: 140,
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: color ?? "var(--text)", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, count, countColor, children }) {
  return (
    <div className="card mt-4">
      <div className="card-header" style={{ justifyContent: "space-between" }}>
        <span>{title}</span>
        {count != null && (
          <span style={{
            background: countColor ?? "#e5e7eb",
            color: countColor ? "#fff" : "var(--text)",
            borderRadius: 99, fontSize: 11, fontWeight: 700,
            padding: "2px 10px",
          }}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const load = () =>
    api.dashboard.get()
      .then(setData)
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  if (loading) return <div className="loading-page"><div className="spinner" /> Loading dashboard…</div>;
  if (!data)   return <div className="page"><div className="alert alert-error">Failed to load dashboard</div></div>;

  const { stats, alerts, inProductionOrders, plannedOrders, recentlyCompleted, availableToShip } = data;

  const totalAlerts = alerts.outOfStock.length + alerts.lowStock.length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
        <div className="gap-2">
          <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard label="In Production"     value={stats.inProduction}    color="#f59e0b" sub="active runs" />
        <StatCard label="Planned Orders"    value={stats.planned}         color="#3b82f6" sub="awaiting start" />
        <StatCard label="Completed"         value={stats.completed}       color="#22c55e" sub="all time" />
        <StatCard label="Available to Ship" value={availableToShip ?? 0}  color="#8b5cf6" sub="products in stock" />
        <StatCard label="Out of Stock"      value={stats.outOfStock}      color={stats.outOfStock > 0 ? "#dc2626" : "#22c55e"} sub="materials" />
        <StatCard label="Low Stock"         value={stats.lowStock}        color={stats.lowStock   > 0 ? "#d97706" : "#22c55e"} sub="below minimum" />
      </div>

      {totalAlerts > 0 && (
        <Section title="Stock Alerts" count={totalAlerts} countColor="#dc2626">
          <table>
            <thead>
              <tr><th>Material</th><th>Status</th><th>Current Stock</th><th>Minimum</th><th>Lead Time</th><th></th></tr>
            </thead>
            <tbody>
              {alerts.outOfStock.map((p) => (
                <tr key={p.id}>
                  <td className="bold">{p.name}</td>
                  <td><span className="badge badge-shortage">Out of Stock</span></td>
                  <td className="danger bold">0 {p.unit}</td>
                  <td className="muted">{p.minimumStock != null ? `${p.minimumStock} ${p.unit}` : "—"}</td>
                  <td className="muted">{p.supplierLeadTime}d</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => router.push("/parts")}>Update Stock</button></td>
                </tr>
              ))}
              {alerts.lowStock.map((p) => (
                <tr key={p.id}>
                  <td className="bold">{p.name}</td>
                  <td><span className="badge badge-warning">Low Stock</span></td>
                  <td className="warning bold">{p.currentStock} {p.unit}</td>
                  <td className="muted">{p.minimumStock} {p.unit}</td>
                  <td className="muted">{p.supplierLeadTime}d</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => router.push("/parts")}>Update Stock</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="In Production" count={inProductionOrders.length} countColor={inProductionOrders.length > 0 ? "#f59e0b" : undefined}>
        {inProductionOrders.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}><p>No orders currently in production.</p></div>
        ) : (
          <table>
            <thead>
              <tr><th>#</th><th>Product</th><th>Qty</th><th>End Date</th><th>Deadline</th><th></th></tr>
            </thead>
            <tbody>
              {inProductionOrders.map((o) => {
                const end = daysUntil(o.productionEndDate);
                return (
                  <tr key={o.id}>
                    <td className="muted mono">#{o.id}</td>
                    <td className="bold">{o.product.name}</td>
                    <td>{o.quantity}</td>
                    <td>{fmtDate(o.productionEndDate)} <span className={end.cls}>({end.label})</span></td>
                    <td className={o.isOnTime === false ? "danger" : "muted"}>
                      {o.desiredDeadline ? fmtDate(o.desiredDeadline) : "—"}
                      {o.isOnTime === false && " ⚠"}
                    </td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => router.push("/orders")}>View</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Planned Orders" count={plannedOrders.length} countColor={plannedOrders.length > 0 ? "#3b82f6" : undefined}>
        {plannedOrders.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}><p>No planned orders.</p></div>
        ) : (
          <table>
            <thead>
              <tr><th>#</th><th>Product</th><th>Qty</th><th>Start Date</th><th>End Date</th><th>Stock</th><th></th></tr>
            </thead>
            <tbody>
              {plannedOrders.map((o) => {
                const start = daysUntil(o.productionStartDate);
                return (
                  <tr key={o.id}>
                    <td className="muted mono">#{o.id}</td>
                    <td className="bold">{o.product.name}</td>
                    <td>{o.quantity}</td>
                    <td>{fmtDate(o.productionStartDate)} <span className={start.cls}>({start.label})</span></td>
                    <td>{fmtDate(o.productionEndDate)}</td>
                    <td>
                      {o.hasShortage
                        ? <span className="badge badge-shortage">Waiting for parts</span>
                        : <span className="badge badge-ok">Ready</span>}
                    </td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => router.push("/orders")}>View</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {recentlyCompleted.length > 0 && (
        <Section title="Recently Completed">
          <table>
            <thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Completed</th></tr></thead>
            <tbody>
              {recentlyCompleted.map((o) => (
                <tr key={o.id}>
                  <td className="muted mono">#{o.id}</td>
                  <td>{o.product.name}</td>
                  <td>{o.quantity}</td>
                  <td className="muted">{fmtDate(o.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}
