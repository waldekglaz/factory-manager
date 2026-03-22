"use client";
import React from "react";
/**
 * Orders page
 * - Place a new order (triggers the production planning algorithm)
 * - List all orders with their calculated production window
 * - Start production, complete, cancel
 * - Print work order / delivery note
 */
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useRole } from "@/lib/role";

const STATUS_ACTIONS = {
  planned:       ["start", "cancel"],
  in_production: ["complete", "cancel"],
  completed:     [],
  cancelled:     [],
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function addDaysClient(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d;
}
function addWorkingDaysClient(date, n) {
  const d = new Date(date);
  let remaining = n;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return d;
}

export default function Orders() {
  const role = useRole();
  const [orders,    setOrders]    = useState([]);
  const [products,  setProducts]  = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [expanded,  setExpanded]  = useState(null);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [search,     setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy,     setSortBy]     = useState("newest");

  const blank = { productId: "", customerId: "", quantity: 1, desiredDeadline: "", notes: "" };
  const [form,    setForm]    = useState(blank);
  const [preview, setPreview] = useState(null);

  const load = async () => {
    try {
      const [ords, prods, custs] = await Promise.all([
        api.orders.list(),
        api.products.list(),
        api.customers.list(),
      ]);
      setOrders(ords);
      setProducts(prods);
      setCustomers(custs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Live preview recalculated whenever product or quantity changes
  useEffect(() => {
    if (!form.productId || !form.quantity) { setPreview(null); return; }
    const prod = products.find((p) => p.id === Number(form.productId));
    if (!prod) return;

    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Check finished goods first
    const finishedStock      = prod.finishedStock ?? 0;
    const qty                = Number(form.quantity);
    const fulfilledFromStock = Math.min(finishedStock, qty);
    const productionQty      = qty - fulfilledFromStock;

    let breakdown = [];
    if (productionQty > 0) {
      breakdown = prod.productParts.map((pp) => {
        const scrap  = pp.scrapFactor ?? 0;
        const needed = Math.ceil((pp.materialQty * productionQty) / pp.productsPerBatch * (1 + scrap));
        const inStock = Math.min(pp.part.currentStock, needed);
        const missing = Math.max(0, needed - pp.part.currentStock);
        const avail   = missing > 0 ? addDaysClient(today, pp.part.supplierLeadTime) : today;
        return { ...pp, needed, inStock, missing, avail };
      });
    }

    let start, end, productionDays;
    if (productionQty === 0) {
      start          = today;
      end            = today;
      productionDays = 0;
    } else {
      start          = breakdown.length
        ? new Date(Math.max(...breakdown.map((b) => b.avail.getTime())))
        : today;
      productionDays = Math.ceil(productionQty / prod.dailyCapacity);
      end            = addWorkingDaysClient(start, productionDays);
    }

    setPreview({ breakdown, start, end, prod, productionDays, fulfilledFromStock, productionQty });
  }, [form.productId, form.quantity, products]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const order = await api.orders.create({
        productId:       Number(form.productId),
        customerId:      form.customerId ? Number(form.customerId) : undefined,
        quantity:        Number(form.quantity),
        desiredDeadline: form.desiredDeadline || undefined,
        notes:           form.notes,
      });
      setSuccess(`Order #${order.id} placed — production planned for ${fmtDate(order.productionStartDate)}`);
      setShowForm(false);
      setForm(blank);
      setPreview(null);
      await load();
      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const doAction = async (order, action) => {
    setError("");
    const labels = { start: "Start production", complete: "Complete", cancel: "Cancel" };
    if (!confirm(`${labels[action]} order #${order.id} — "${order.product.name}"?`)) return;
    try {
      if (action === "start")    await api.orders.start(order.id);
      if (action === "complete") await api.orders.complete(order.id);
      if (action === "cancel")      await api.orders.cancel(order.id);
      setSuccess(`Order #${order.id} updated`);
      await load();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="loading-page"><div className="spinner" /> Loading orders…</div>;

  const visibleOrders = orders
    .filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return o.product.name.toLowerCase().includes(q) || o.customer?.name?.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "newest")  return b.id - a.id;
      if (sortBy === "oldest")  return a.id - b.id;
      if (sortBy === "status")  return a.status.localeCompare(b.status);
      if (sortBy === "product") return a.product.name.localeCompare(b.product.name);
      return 0;
    });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Orders</div>
          <div className="page-subtitle">
            {orders.length} total · {orders.filter((o) => o.status === "in_production").length} in production
          </div>
        </div>
        {role === "manager" && (
          <button className="btn btn-primary" onClick={() => { setShowForm(true); setError(""); }}>
            + Place Order
          </button>
        )}
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* ── New Order Form ── */}
      {showForm && role === "manager" && (
        <div className="card mt-4">
          <div className="card-header">Place New Order</div>
          <form onSubmit={handleSubmit} className="form">
            <div className="form-row">
              <div className="field">
                <label>Product *</label>
                <select required value={form.productId}
                  onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                  <option value="">— select product —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.finishedStock > 0 ? ` (${p.finishedStock} in stock)` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Quantity (units) *</label>
                <input type="number" min="1" required value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Customer (optional)</label>
                <select value={form.customerId}
                  onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                  <option value="">— internal / no customer —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Desired Deadline (optional)</label>
                <input type="date" value={form.desiredDeadline}
                  onChange={(e) => setForm({ ...form, desiredDeadline: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Notes</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" />
            </div>

            {/* Live plan preview */}
            {preview && (
              <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 8, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13 }}>
                  Production Plan Preview
                </div>

                {preview.fulfilledFromStock > 0 && (
                  <div className="alert alert-success" style={{ marginBottom: 12 }}>
                    {preview.fulfilledFromStock} unit(s) fulfilled from finished goods stock.
                    {preview.productionQty > 0
                      ? ` ${preview.productionQty} unit(s) will be produced.`
                      : " No production needed."}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <Stat label="Production Start" value={fmtDate(preview.start)} />
                  <Stat label="Production End"   value={fmtDate(preview.end)} />
                  <Stat label="Duration"         value={preview.productionDays > 0 ? `${preview.productionDays} working day(s)` : "From stock"} />
                </div>

                {form.desiredDeadline && (
                  <div className={`alert ${preview.end <= new Date(form.desiredDeadline) ? "alert-success" : "alert-error"}`}
                    style={{ marginBottom: 12 }}>
                    {preview.end <= new Date(form.desiredDeadline)
                      ? `On time — completes ${Math.round((new Date(form.desiredDeadline) - preview.end) / 86400000)} day(s) before deadline`
                      : `Late by ${Math.round((preview.end - new Date(form.desiredDeadline)) / 86400000)} day(s)`}
                  </div>
                )}

                {preview.breakdown.length > 0 && (
                  <table style={{ marginTop: 4 }}>
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th>Needed</th>
                        <th>Allocated</th>
                        <th>Still Missing</th>
                        <th>Expected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.breakdown.map((b, i) => (
                        <tr key={i}>
                          <td>{b.part.name}</td>
                          <td>{b.needed} {b.part.unit}</td>
                          <td className={b.missing > 0 ? "warning" : "success"}>{b.inStock}</td>
                          <td className={b.missing > 0 ? "danger bold" : "muted"}>{b.missing > 0 ? b.missing : "—"}</td>
                          <td className={b.missing > 0 ? "warning" : "muted"}>{fmtDate(b.avail)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            <div className="gap-2">
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Placing…" : "Place Order"}</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(false); setPreview(null); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Orders list ── */}
      {orders.length === 0 ? (
        <div className="card mt-4">
          <div className="empty">
            <div className="empty-icon">📋</div>
            <p>No orders yet. Click "Place Order" to start.</p>
          </div>
        </div>
      ) : (
        <div className="card mt-4">
          <div style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", alignItems: "center" }}>
            <input
              placeholder="Search product or customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: "1 1 200px", minWidth: 0 }}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ flex: "0 0 auto" }}>
              <option value="all">All statuses</option>
              <option value="planned">Planned</option>
              <option value="in_production">In production</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ flex: "0 0 auto" }}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="product">Product A→Z</option>
              <option value="status">Status</option>
            </select>
            {(search || statusFilter !== "all") && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
                Clear
              </button>
            )}
            <span className="muted" style={{ fontSize: 13 }}>{visibleOrders.length} of {orders.length}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Customer</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Deadline</th>
                  <th>On Time</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.length === 0 && (
                  <tr><td colSpan={10}>
                    <div className="empty"><div className="empty-icon">🔍</div><p>No orders match your filters.</p></div>
                  </td></tr>
                )}
                {visibleOrders.map((order) => (
                  <React.Fragment key={order.id}>
                    <tr>
                      <td className="muted mono">#{order.id}</td>
                      <td className="bold">{order.product.name}</td>
                      <td className="muted">{order.customer?.name ?? "—"}</td>
                      <td>{order.quantity}</td>
                      <td><span className={`badge badge-${order.status}`}>{order.status.replace("_", " ")}</span></td>
                      <td>{fmtDate(order.productionStartDate)}</td>
                      <td>{fmtDate(order.productionEndDate)}</td>
                      <td className={order.desiredDeadline ? "" : "muted"}>{fmtDate(order.desiredDeadline)}</td>
                      <td>
                        {order.desiredDeadline == null ? <span className="muted">—</span>
                          : order.isOnTime
                            ? <span className="success">Yes</span>
                            : <span className="danger">No</span>}
                      </td>
                      <td>
                        <div className="gap-2" style={{ flexWrap: "wrap" }}>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                            {expanded === order.id ? "Hide" : "Details"}
                          </button>
                          {role === "manager" && STATUS_ACTIONS[order.status]?.includes("start") && (
                            <button className="btn btn-success btn-sm" onClick={() => doAction(order, "start")}>Start</button>
                          )}
                          {(role === "manager" || role === "dispatcher") && STATUS_ACTIONS[order.status]?.includes("complete") && (
                            <button className="btn btn-primary btn-sm" onClick={() => doAction(order, "complete")}>Complete</button>
                          )}
                          {role === "manager" && STATUS_ACTIONS[order.status]?.includes("cancel") && (
                            <button className="btn btn-danger btn-sm" onClick={() => doAction(order, "cancel")}>Cancel</button>
                          )}
                          {/* Print buttons — available for all non-cancelled orders */}
                          {order.status !== "cancelled" && (
                            <>
                              <a className="btn btn-ghost btn-sm"
                                href={api.orders.workOrderUrl(order.id)}
                                target="_blank" rel="noreferrer"
                                title="Open printable work order">
                                Work Order
                              </a>
                              <a className="btn btn-ghost btn-sm"
                                href={api.orders.deliveryNoteUrl(order.id)}
                                target="_blank" rel="noreferrer"
                                title="Open printable delivery note">
                                Delivery Note
                              </a>
                            </>
                          )}
                          {order.status === "completed" && role !== "dispatcher" && (
                            <a className="btn btn-primary btn-sm"
                              href={api.orders.invoiceUrl(order.id)}
                              target="_blank" rel="noreferrer"
                              title="Open printable invoice">
                              Invoice
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded parts breakdown */}
                    {expanded === order.id && (
                      <tr key={`${order.id}-detail`}>
                        <td colSpan={10} style={{ padding: 0 }}>
                          <div style={{ background: "#f8fafc", padding: 16 }}>
                            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>
                              Parts Breakdown — Order #{order.id}
                              {order.fulfilledFromStock > 0 && (
                                <span className="badge badge-ok" style={{ marginLeft: 8, fontWeight: 400 }}>
                                  {order.fulfilledFromStock} unit(s) from finished goods
                                </span>
                              )}
                            </div>
                            <div className="parts-grid">
                              {order.orderParts.map((op) => (
                                <div key={op.id} className="part-card">
                                  <div className="part-card-name">{op.part.name}</div>
                                  <div className="part-card-row"><span className="muted">Needed</span><span className="bold">{op.quantityNeeded} {op.part.unit}</span></div>
                                  <div className="part-card-row"><span className="muted">Allocated</span><span className={op.quantityMissing > 0 ? "warning" : "success"}>{op.quantityInStock}</span></div>
                                  <div className="part-card-row"><span className="muted">Still missing</span><span className={op.quantityMissing > 0 ? "danger bold" : "muted"}>{op.quantityMissing > 0 ? op.quantityMissing : "—"}</span></div>
                                  <div className="part-card-row"><span className="muted">Expected by</span><span>{fmtDate(op.availableDate)}</span></div>
                                </div>
                              ))}
                            </div>
                            {order.notes && <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>Note: {order.notes}</p>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{value}</div>
    </div>
  );
}
