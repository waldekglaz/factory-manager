/**
 * Orders page
 * - Place a new order (triggers the production planning algorithm)
 * - List all orders with their calculated production window
 * - Start production (deducts stock), complete, cancel
 */
import { useState, useEffect } from "react";
import { api } from "../api";

const STATUS_ACTIONS = {
  planned:       ["recalculate", "start", "cancel"],
  in_production: ["complete", "cancel"],
  completed:     [],
  cancelled:     [],
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Orders() {
  const [orders, setOrders]     = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null); // order id to show detail
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  const blank = { productId: "", quantity: 1, desiredDeadline: "", notes: "" };
  const [form, setForm]     = useState(blank);
  const [preview, setPreview] = useState(null); // live plan preview (before submit)

  const load = async () => {
    try {
      const [ords, prods] = await Promise.all([api.orders.list(), api.products.list()]);
      setOrders(ords);
      setProducts(prods);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Live preview: re-calculate whenever productId or quantity changes ─────────
  // We approximate it client-side so the user sees a plan BEFORE placing the order.
  useEffect(() => {
    if (!form.productId || !form.quantity) { setPreview(null); return; }
    const prod = products.find((p) => p.id === Number(form.productId));
    if (!prod) return;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const breakdown = prod.productParts.map((pp) => {
      const needed  = Math.ceil((pp.materialQty * Number(form.quantity)) / pp.productsPerBatch);
      const inStock = Math.min(pp.part.currentStock, needed);
      const missing = Math.max(0, needed - pp.part.currentStock);
      const avail   = missing > 0 ? addDaysClient(today, pp.part.supplierLeadTime) : today;
      return { ...pp, needed, inStock, missing, avail };
    });

    const start = breakdown.length
      ? new Date(Math.max(...breakdown.map((b) => b.avail.getTime())))
      : today;
    const productionDays = Math.ceil(Number(form.quantity) / prod.dailyCapacity);
    const end = addWorkingDaysClient(start, productionDays);

    setPreview({ breakdown, start, end, prod, productionDays });
  }, [form.productId, form.quantity, products]);

  // Calendar days — used for supplier lead times
  function addDaysClient(date, n) {
    const d = new Date(date); d.setDate(d.getDate() + n); return d;
  }
  // Working days Mon–Fri — used for production duration
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const order = await api.orders.create({
        productId:       Number(form.productId),
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
    }
  };

  const doAction = async (order, action) => {
    setError("");
    try {
      const labels = { start: "Start production", recalculate: "Recalculate plan", complete: "Complete", cancel: "Cancel" };
      if (!confirm(`${labels[action]} order #${order.id} — "${order.product.name}"?`)) return;

      if (action === "start")       await api.orders.start(order.id);
      if (action === "recalculate") await api.orders.recalculate(order.id);
      if (action === "complete")    await api.orders.complete(order.id);
      if (action === "cancel")      await api.orders.cancel(order.id);

      setSuccess(`Order #${order.id} updated`);
      await load();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="loading-page"><div className="spinner" /> Loading orders…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Orders</div>
          <div className="page-subtitle">{orders.length} total · {orders.filter((o) => o.status === "in_production").length} in production</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(true); setError(""); }}>
          + Place Order
        </button>
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* ── New Order Form ── */}
      {showForm && (
        <div className="card mt-4">
          <div className="card-header">Place New Order</div>
          <form onSubmit={handleSubmit} className="form">
            <div className="form-row">
              <div className="field">
                <label>Product *</label>
                <select required value={form.productId}
                  onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                  <option value="">— select product —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                <label>Desired Deadline (optional)</label>
                <input type="date" value={form.desiredDeadline}
                  onChange={(e) => setForm({ ...form, desiredDeadline: e.target.value })} />
              </div>
              <div className="field">
                <label>Notes</label>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" />
              </div>
            </div>

            {/* Live plan preview */}
            {preview && (
              <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 8, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13 }}>
                  Production Plan Preview
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <Stat label="Production Start" value={fmtDate(preview.start)} />
                  <Stat label="Production End"   value={fmtDate(preview.end)} />
                  <Stat label="Duration"         value={`${preview.productionDays} day(s)`} />
                </div>
                {form.desiredDeadline && (
                  <div className={`alert ${preview.end <= new Date(form.desiredDeadline) ? "alert-success" : "alert-error"}`}
                    style={{ marginBottom: 0 }}>
                    {preview.end <= new Date(form.desiredDeadline)
                      ? `On time — completes ${Math.round((new Date(form.desiredDeadline) - preview.end) / 86400000)} day(s) before deadline`
                      : `Late by ${Math.round((preview.end - new Date(form.desiredDeadline)) / 86400000)} day(s)`}
                  </div>
                )}
                <table style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Part</th>
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
              </div>
            )}

            <div className="gap-2">
              <button type="submit" className="btn btn-primary">Place Order</button>
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
          <div className="table-wrap">
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
                  <th>On Time</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <>
                    <tr key={order.id}>
                      <td className="muted mono">#{order.id}</td>
                      <td className="bold">{order.product.name}</td>
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
                        <div className="gap-2">
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                            {expanded === order.id ? "Hide" : "Details"}
                          </button>
                          {STATUS_ACTIONS[order.status]?.includes("recalculate") && (
                            <button className="btn btn-ghost btn-sm" onClick={() => doAction(order, "recalculate")} title="Re-run planning with current stock levels">
                              Recalculate
                            </button>
                          )}
                          {STATUS_ACTIONS[order.status]?.includes("start") && (
                            <button className="btn btn-success btn-sm" onClick={() => doAction(order, "start")}>Start</button>
                          )}
                          {STATUS_ACTIONS[order.status]?.includes("complete") && (
                            <button className="btn btn-primary btn-sm" onClick={() => doAction(order, "complete")}>Complete</button>
                          )}
                          {STATUS_ACTIONS[order.status]?.includes("cancel") && (
                            <button className="btn btn-danger btn-sm" onClick={() => doAction(order, "cancel")}>Cancel</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Expanded parts breakdown */}
                    {expanded === order.id && (
                      <tr key={`${order.id}-detail`}>
                        <td colSpan={9} style={{ padding: 0 }}>
                          <div style={{ background: "#f8fafc", padding: 16 }}>
                            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>
                              Parts Breakdown — Order #{order.id}
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
                  </>
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
