"use client";
/**
 * Schedule / Gantt page
 * Shows all non-cancelled orders on a timeline with colour-coded bars.
 * The "today" line is drawn in red. Hovering a bar shows details.
 */
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

const STATUS_COLOR = {
  planned:       "#3b82f6",
  in_production: "#f59e0b",
  completed:     "#22c55e",
};

function fmtShort(d) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function Schedule() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.orders.list()
      .then((data) => setOrders(data.filter((o) => o.status !== "cancelled")))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-page"><div className="spinner" /> Loading schedule…</div>;

  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Determine the full date range for the chart
  const allDates = orders.flatMap((o) => [
    new Date(o.productionStartDate),
    new Date(o.productionEndDate),
  ]);
  if (allDates.length === 0) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-title">Production Schedule</div>
        </div>
        <div className="card">
          <div className="empty">
            <div className="empty-icon">📅</div>
            <p>No orders to display. Place an order to see the schedule.</p>
          </div>
        </div>
      </div>
    );
  }

  // Chart spans from 3 days before earliest start to 3 days after latest end
  const rangeStart = new Date(Math.min(...allDates.map((d) => d.getTime())));
  rangeStart.setDate(rangeStart.getDate() - 3);
  const rangeEnd   = new Date(Math.max(...allDates.map((d) => d.getTime())));
  rangeEnd.setDate(rangeEnd.getDate() + 3);

  const totalMs = rangeEnd.getTime() - rangeStart.getTime();

  // Convert a date to a left-offset percentage
  const pct = (d) =>
    Math.max(0, Math.min(100, ((new Date(d).getTime() - rangeStart.getTime()) / totalMs) * 100));

  // Width of a bar (clamped to at least 0.5% so very short orders are visible)
  const barW = (start, end) =>
    Math.max(0.5, pct(end) - pct(start));

  // Generate month tick marks for the axis
  const ticks = [];
  const cursor = new Date(rangeStart); cursor.setDate(1);
  while (cursor <= rangeEnd) {
    ticks.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const todayPct = pct(today);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Production Schedule</div>
          <div className="page-subtitle">
            {orders.length} active order(s) — {orders.filter((o) => o.status === "in_production").length} in production
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="gap-4" style={{ marginBottom: 16 }}>
        {Object.entries(STATUS_COLOR).map(([s, c]) => (
          <div key={s} className="gap-2" style={{ fontSize: 12 }}>
            <span style={{ width: 12, height: 12, background: c, borderRadius: 3, display: "inline-block" }} />
            {s.replace("_", " ")}
          </div>
        ))}
        <div className="gap-2" style={{ fontSize: 12 }}>
          <span style={{ width: 2, height: 12, background: "#ef4444", display: "inline-block" }} />
          Today
        </div>
      </div>

      <div className="card">
        <div className="gantt-wrap">
          {/* Month axis */}
          <div className="gantt-row" style={{ marginBottom: 4 }}>
            <div className="gantt-label" style={{ color: "transparent" }}>—</div>
            <div className="gantt-track" style={{ background: "transparent", position: "relative" }}>
              {ticks.map((t, i) => (
                <span key={i} style={{
                  position: "absolute",
                  left: `${pct(t)}%`,
                  fontSize: 11,
                  color: "var(--muted)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  transform: "translateX(-50%)",
                }}>
                  {t.toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}
                </span>
              ))}
            </div>
          </div>

          {/* Order rows */}
          {orders.map((order) => (
            <div key={order.id} className="gantt-row">
              <div className="gantt-label" title={order.product.name}>
                <span className="muted" style={{ fontSize: 10 }}>#{order.id}</span>{" "}
                {order.product.name}
              </div>
              <div className="gantt-track">
                {/* Today marker */}
                <div className="gantt-today" style={{ left: `${todayPct}%` }}>
                  <span className="gantt-today-label">Today</span>
                </div>

                {/* Production bar */}
                <div
                  className="gantt-bar"
                  title={`${order.product.name} ×${order.quantity}\n${fmtShort(order.productionStartDate)} → ${fmtShort(order.productionEndDate)}\nStatus: ${order.status}`}
                  style={{
                    left:  `${pct(order.productionStartDate)}%`,
                    width: `${barW(order.productionStartDate, order.productionEndDate)}%`,
                    background: STATUS_COLOR[order.status] || "#94a3b8",
                  }}
                >
                  ×{order.quantity} · {fmtShort(order.productionStartDate)}–{fmtShort(order.productionEndDate)}
                </div>

                {/* Deadline marker */}
                {order.desiredDeadline && (
                  <div style={{
                    position: "absolute",
                    left: `${pct(order.desiredDeadline)}%`,
                    top: 0, bottom: 0,
                    width: 2,
                    background: order.isOnTime ? "#22c55e" : "#ef4444",
                    zIndex: 3,
                  }} title={`Deadline: ${fmtShort(order.desiredDeadline)}`} />
                )}
              </div>
              <div style={{ width: 80, fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>
                {order.quantity} unit{order.quantity !== 1 ? "s" : ""}
              </div>
            </div>
          ))}
        </div>

        {/* Summary table below the Gantt */}
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Status</th>
                <th>Start</th>
                <th>End</th>
                <th>Deadline</th>
                <th>Shortages?</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const hasShortage = order.orderParts.some((op) => op.quantityMissing > 0);
                return (
                  <tr key={order.id}>
                    <td className="muted mono">#{order.id}</td>
                    <td className="bold">{order.product.name}</td>
                    <td>{order.quantity}</td>
                    <td><span className={`badge badge-${order.status}`}>{order.status.replace("_", " ")}</span></td>
                    <td>{fmtShort(order.productionStartDate)}</td>
                    <td>{fmtShort(order.productionEndDate)}</td>
                    <td>{order.desiredDeadline ? fmtShort(order.desiredDeadline) : <span className="muted">—</span>}</td>
                    <td>{hasShortage
                      ? <span className="badge badge-shortage">Yes — awaiting parts</span>
                      : <span className="badge badge-ok">No</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
