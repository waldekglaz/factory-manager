"use client";
import React from "react";
/**
 * Procurement page
 * Two sections: Suppliers (with parts they supply) and Purchase Orders.
 */
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const PO_STATUS_COLORS = {
  draft:     "badge-warning",
  sent:      "badge-planned",
  partial:   "badge-warning",
  received:  "badge-ok",
  cancelled: "badge-shortage",
};

// ════════════════════════════════════════
//  TOP-LEVEL PAGE
// ════════════════════════════════════════
export default function Procurement() {
  const [tab, setTab] = useState("po"); // "po" | "suppliers"

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Procurement</div>
          <div className="page-subtitle">Suppliers and incoming purchase orders</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className={`btn ${tab === "po" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setTab("po")}
        >
          Purchase Orders
        </button>
        <button
          className={`btn ${tab === "suppliers" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setTab("suppliers")}
        >
          Suppliers
        </button>
      </div>

      {tab === "po"        && <PurchaseOrdersSection />}
      {tab === "suppliers" && <SuppliersSection />}
    </div>
  );
}

// ════════════════════════════════════════
//  PURCHASE ORDERS
// ════════════════════════════════════════
function PurchaseOrdersSection() {
  const [pos,       setPos]       = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [parts,     setParts]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [expanded,  setExpanded]  = useState(null);
  const [receiving, setReceiving] = useState(null); // po being received
  const [recvQty,   setRecvQty]   = useState({});   // { lineId: qty }
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");

  const blank = { supplierId: "", expectedDate: "", notes: "", lines: [] };
  const [form, setForm] = useState(blank);

  const load = async () => {
    try {
      const [p, s, parts] = await Promise.all([
        api.purchaseOrders.list(),
        api.suppliers.list(),
        api.parts.list(),
      ]);
      setPos(p);
      setSuppliers(s);
      setParts(parts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const getMoq = (supplierId, partId) => {
    const supplier = suppliers.find((s) => s.id === Number(supplierId));
    return supplier?.supplierParts?.find((sp) => sp.partId === Number(partId))?.minimumOrderQty ?? null;
  };

  const addLine = () => {
    const unused = parts.find((p) => !form.lines.some((l) => Number(l.partId) === p.id));
    if (!unused) return;
    const moq = getMoq(form.supplierId, unused.id) ?? 1;
    setForm((f) => ({ ...f, lines: [...f.lines, { partId: unused.id, quantityOrdered: moq }] }));
  };
  const removeLine   = (idx) => setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));
  const updateLine   = (idx, field, val) =>
    setForm((f) => ({ ...f, lines: f.lines.map((r, i) => (i === idx ? { ...r, [field]: val } : r)) }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    if (form.lines.length === 0) { setError("Add at least one part line"); return; }
    for (const line of form.lines) {
      const moq = getMoq(form.supplierId, line.partId);
      if (moq && Number(line.quantityOrdered) < moq) {
        const part = parts.find((p) => p.id === Number(line.partId));
        setError(`Minimum order quantity for "${part?.name}" is ${moq} ${part?.unit ?? "units"}`);
        return;
      }
    }
    try {
      await api.purchaseOrders.create({
        supplierId:   Number(form.supplierId),
        expectedDate: form.expectedDate || undefined,
        notes:        form.notes,
        lines: form.lines.map((l) => ({ partId: Number(l.partId), quantityOrdered: Number(l.quantityOrdered) })),
      });
      setSuccess("Purchase order created");
      setShowForm(false);
      setForm(blank);
      await load();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const openReceive = (po) => {
    setReceiving(po);
    const qty = {};
    po.lines.forEach((l) => {
      const remaining = l.quantityOrdered - l.quantityReceived;
      qty[l.id] = remaining > 0 ? remaining : 0;
    });
    setRecvQty(qty);
  };

  const handleReceive = async () => {
    setError("");
    try {
      const lines = Object.entries(recvQty)
        .map(([lineId, quantityReceived]) => ({ lineId: Number(lineId), quantityReceived: Number(quantityReceived) }))
        .filter((l) => l.quantityReceived > 0);

      if (lines.length === 0) { setError("Enter at least one quantity to receive"); return; }

      await api.purchaseOrders.receive(receiving.id, { lines });
      setSuccess(`Delivery recorded — stock updated${lines.length > 1 ? " and affected orders recalculated" : ""}`);
      setReceiving(null);
      await load();
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err.message);
    }
  };

  const cancel = async (po) => {
    if (!confirm(`Cancel purchase order #${po.id}?`)) return;
    try {
      await api.purchaseOrders.update(po.id, { status: "cancelled" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="loading-page"><div className="spinner" /> Loading…</div>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={() => { setShowForm(true); setError(""); }}>
          + New Purchase Order
        </button>
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* ── Receive modal ── */}
      {receiving && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{ background: "#fff", borderRadius: 10, padding: 28, width: 500, maxWidth: "95vw", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>
              Receive Delivery — PO #{receiving.id}
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
              Enter quantities received. Stock will be updated and waiting orders recalculated.
            </div>
            <table style={{ marginBottom: 16 }}>
              <thead>
                <tr><th>Part</th><th>Ordered</th><th>Already Received</th><th>Receive Now</th></tr>
              </thead>
              <tbody>
                {receiving.lines.map((l) => {
                  const remaining = l.quantityOrdered - l.quantityReceived;
                  return (
                    <tr key={l.id}>
                      <td>{l.part.name} ({l.part.unit})</td>
                      <td>{l.quantityOrdered}</td>
                      <td className={l.quantityReceived > 0 ? "success" : "muted"}>{l.quantityReceived}</td>
                      <td>
                        <input
                          type="number" min="0" max={remaining}
                          value={recvQty[l.id] ?? 0}
                          onChange={(e) => setRecvQty({ ...recvQty, [l.id]: e.target.value })}
                          style={{ width: 80 }}
                          disabled={remaining <= 0}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="gap-2">
              <button className="btn btn-primary" onClick={handleReceive}>Confirm Receipt</button>
              <button className="btn btn-ghost" onClick={() => setReceiving(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create PO form ── */}
      {showForm && (
        <div className="card mt-4">
          <div className="card-header">New Purchase Order</div>
          <form onSubmit={handleCreate} className="form">
            <div className="form-row">
              <div className="field">
                <label>Supplier *</label>
                <select required value={form.supplierId}
                  onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                  <option value="">— select supplier —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Expected Delivery Date</label>
                <input type="date" value={form.expectedDate}
                  onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Notes</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" />
            </div>

            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Parts to Order</div>
            {form.lines.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px auto", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Part</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Qty to Order</span>
                <span />
              </div>
            )}
            {form.lines.map((row, idx) => {
              const moq = getMoq(form.supplierId, row.partId);
              const belowMoq = moq && Number(row.quantityOrdered) < moq;
              return (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 120px auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <select value={row.partId}
                    onChange={(e) => {
                      const newMoq = getMoq(form.supplierId, e.target.value) ?? 1;
                      updateLine(idx, "partId", Number(e.target.value));
                      updateLine(idx, "quantityOrdered", Math.max(Number(row.quantityOrdered), newMoq));
                    }}>
                    {parts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                  </select>
                  <div>
                    <input type="number" min={moq ?? 1} value={row.quantityOrdered}
                      style={{ width: "100%", borderColor: belowMoq ? "var(--danger, #dc2626)" : undefined }}
                      onChange={(e) => updateLine(idx, "quantityOrdered", e.target.value)} />
                    {moq && <div style={{ fontSize: 11, color: belowMoq ? "#dc2626" : "var(--muted)", marginTop: 2 }}>Min: {moq}</div>}
                  </div>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeLine(idx)}>✕</button>
                </div>
              );
            })}
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} onClick={addLine}>
              + Add Part
            </button>

            <div className="gap-2">
              <button type="submit" className="btn btn-primary">Create Purchase Order</button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* ── PO List ── */}
      {pos.length === 0 && !showForm ? (
        <div className="card mt-4">
          <div className="empty">
            <div className="empty-icon">🚚</div>
            <p>No purchase orders yet.</p>
          </div>
        </div>
      ) : (
        <div className="card mt-4">
          <table>
            <thead>
              <tr><th>#</th><th>Supplier</th><th>Status</th><th>Expected</th><th>Lines</th><th></th></tr>
            </thead>
            <tbody>
              {pos.map((po) => (
                <React.Fragment key={po.id}>
                  <tr>
                    <td className="muted mono">#{po.id}</td>
                    <td className="bold">{po.supplier.name}</td>
                    <td><span className={`badge ${PO_STATUS_COLORS[po.status] ?? ""}`}>{po.status}</span></td>
                    <td className="muted">{fmtDate(po.expectedDate)}</td>
                    <td>{po.lines.length} line{po.lines.length !== 1 ? "s" : ""}</td>
                    <td>
                      <div className="gap-2">
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => setExpanded(expanded === po.id ? null : po.id)}>
                          {expanded === po.id ? "Hide" : "Details"}
                        </button>
                        {po.status !== "received" && po.status !== "cancelled" && (
                          <button className="btn btn-success btn-sm" onClick={() => openReceive(po)}>
                            Receive
                          </button>
                        )}
                        {po.status !== "received" && po.status !== "cancelled" && (
                          <button className="btn btn-danger btn-sm" onClick={() => cancel(po)}>Cancel</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === po.id && (
                    <tr key={`${po.id}-lines`}>
                      <td colSpan={6} style={{ padding: 0 }}>
                        <div style={{ background: "#f8fafc", padding: "12px 16px" }}>
                          {po.notes && <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Note: {po.notes}</p>}
                          <table>
                            <thead>
                              <tr><th>Part</th><th>Ordered</th><th>Received</th><th>Remaining</th></tr>
                            </thead>
                            <tbody>
                              {po.lines.map((l) => (
                                <tr key={l.id}>
                                  <td>{l.part.name} ({l.part.unit})</td>
                                  <td>{l.quantityOrdered}</td>
                                  <td className={l.quantityReceived >= l.quantityOrdered ? "success" : l.quantityReceived > 0 ? "warning" : "muted"}>
                                    {l.quantityReceived}
                                  </td>
                                  <td className={l.quantityOrdered - l.quantityReceived > 0 ? "danger" : "muted"}>
                                    {l.quantityOrdered - l.quantityReceived}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ════════════════════════════════════════
//  SUPPLIERS
// ════════════════════════════════════════
function SuppliersSection() {
  const [suppliers, setSuppliers] = useState([]);
  const [parts,     setParts]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [expanded,  setExpanded]  = useState(null);
  const [linkForm,  setLinkForm]  = useState(null); // supplierId being linked
  const [linkData,  setLinkData]  = useState({ partId: "", unitCost: "", leadTimeOverride: "", minimumOrderQty: "" });
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");

  const blank = { name: "", email: "", phone: "", defaultLeadTime: 7, notes: "" };
  const [form, setForm] = useState(blank);

  const load = async () => {
    try {
      const [s, p] = await Promise.all([api.suppliers.list(), api.parts.list()]);
      setSuppliers(s);
      setParts(p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(blank); setEditing(null); setShowForm(true); setError(""); };
  const openEdit   = (s) => {
    setForm({ name: s.name, email: s.email ?? "", phone: s.phone ?? "", defaultLeadTime: s.defaultLeadTime, notes: s.notes });
    setEditing(s);
    setShowForm(true);
    setError("");
  };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        name:            form.name.trim(),
        email:           form.email           || null,
        phone:           form.phone           || null,
        defaultLeadTime: Number(form.defaultLeadTime),
        notes:           form.notes,
      };
      if (editing) {
        await api.suppliers.update(editing.id, payload);
        setSuccess("Supplier updated");
      } else {
        await api.suppliers.create(payload);
        setSuccess("Supplier created");
      }
      closeForm();
      await load();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (s) => {
    if (!confirm(`Delete supplier "${s.name}"?`)) return;
    try {
      await api.suppliers.delete(s.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLinkPart = async (supplierId) => {
    setError("");
    try {
      await api.suppliers.linkPart(supplierId, {
        partId:           Number(linkData.partId),
        unitCost:         linkData.unitCost           ? Number(linkData.unitCost)           : undefined,
        leadTimeOverride: linkData.leadTimeOverride   ? Number(linkData.leadTimeOverride)   : undefined,
        minimumOrderQty:  linkData.minimumOrderQty    ? Number(linkData.minimumOrderQty)    : undefined,
      });
      setLinkForm(null);
      setLinkData({ partId: "", unitCost: "", leadTimeOverride: "", minimumOrderQty: "" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUnlinkPart = async (supplierId, partId) => {
    try {
      await api.suppliers.unlinkPart(supplierId, partId);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div style={{ padding: 20 }}><div className="spinner" /></div>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={openCreate}>+ New Supplier</button>
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {showForm && (
        <div className="card mt-4">
          <div className="card-header">{editing ? `Edit "${editing.name}"` : "New Supplier"}</div>
          <form onSubmit={handleSubmit} className="form">
            <div className="form-row">
              <div className="field">
                <label>Name *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Default Lead Time (days)</label>
                <input type="number" min="1" value={form.defaultLeadTime}
                  onChange={(e) => setForm({ ...form, defaultLeadTime: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="optional" />
              </div>
              <div className="field">
                <label>Phone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="optional" />
              </div>
            </div>
            <div className="field">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" />
            </div>
            <div className="gap-2">
              <button type="submit" className="btn btn-primary">{editing ? "Save Changes" : "Create Supplier"}</button>
              <button type="button" className="btn btn-ghost" onClick={closeForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {suppliers.length === 0 && !showForm ? (
        <div className="card mt-4">
          <div className="empty">
            <div className="empty-icon">🏭</div>
            <p>No suppliers yet.</p>
          </div>
        </div>
      ) : (
        suppliers.map((s) => {
          // parts not yet linked to this supplier (for the link form dropdown)
          const unlinkedParts = parts.filter((p) => !s.supplierParts.some((sp) => sp.partId === p.id));
          return (
            <div key={s.id} className="card mt-4">
              <div className="card-header" style={{ justifyContent: "space-between" }}>
                <div className="gap-2">
                  <span>🏭</span>
                  <span>{s.name}</span>
                  <span className="muted" style={{ fontWeight: 400 }}>— default {s.defaultLeadTime}d lead time</span>
                </div>
                <div className="gap-2">
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                    {s.supplierParts.length} part{s.supplierParts.length !== 1 ? "s" : ""}
                    {expanded === s.id ? " ▲" : " ▼"}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s)}>Delete</button>
                </div>
              </div>

              {s.email && <div style={{ padding: "4px 20px 0", fontSize: 12, color: "var(--muted)" }}>{s.email}{s.phone ? ` · ${s.phone}` : ""}</div>}

              {expanded === s.id && (
                <div style={{ padding: "12px 20px" }}>
                  {s.supplierParts.length > 0 && (
                    <table style={{ marginBottom: 12 }}>
                      <thead>
                        <tr><th>Part</th><th>Unit Cost</th><th>Min. Order Qty</th><th>Lead Time Override</th><th></th></tr>
                      </thead>
                      <tbody>
                        {s.supplierParts.map((sp) => (
                          <tr key={sp.id}>
                            <td>{sp.part.name} ({sp.part.unit})</td>
                            <td className="muted">{sp.unitCost != null ? `£${sp.unitCost}` : "—"}</td>
                            <td className="muted">{sp.minimumOrderQty != null ? `${sp.minimumOrderQty} ${sp.part.unit}` : "—"}</td>
                            <td className="muted">
                              {sp.leadTimeOverride != null ? `${sp.leadTimeOverride}d` : `(default ${s.defaultLeadTime}d)`}
                            </td>
                            <td>
                              <button className="btn btn-danger btn-sm"
                                onClick={() => handleUnlinkPart(s.id, sp.partId)}>
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {linkForm === s.id ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label style={{ fontSize: 11 }}>Part</label>
                        <select value={linkData.partId}
                          onChange={(e) => setLinkData({ ...linkData, partId: e.target.value })}>
                          <option value="">— select —</option>
                          {unlinkedParts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label style={{ fontSize: 11 }}>Unit Cost (optional)</label>
                        <input type="number" min="0" step="0.01" placeholder="e.g. 2.50"
                          value={linkData.unitCost}
                          onChange={(e) => setLinkData({ ...linkData, unitCost: e.target.value })}
                          style={{ width: 110 }} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label style={{ fontSize: 11 }}>Min. Order Qty (optional)</label>
                        <input type="number" min="1" placeholder="e.g. 100"
                          value={linkData.minimumOrderQty}
                          onChange={(e) => setLinkData({ ...linkData, minimumOrderQty: e.target.value })}
                          style={{ width: 110 }} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label style={{ fontSize: 11 }}>Lead Time Override (days)</label>
                        <input type="number" min="1" placeholder={`default: ${s.defaultLeadTime}d`}
                          value={linkData.leadTimeOverride}
                          onChange={(e) => setLinkData({ ...linkData, leadTimeOverride: e.target.value })}
                          style={{ width: 130 }} />
                      </div>
                      <button className="btn btn-primary btn-sm"
                        disabled={!linkData.partId}
                        onClick={() => handleLinkPart(s.id)}>
                        Link Part
                      </button>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => { setLinkForm(null); setLinkData({ partId: "", unitCost: "", leadTimeOverride: "", minimumOrderQty: "" }); }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    unlinkedParts.length > 0 && (
                      <button className="btn btn-ghost btn-sm" onClick={() => { setLinkForm(s.id); setLinkData({ partId: unlinkedParts[0].id, unitCost: "", leadTimeOverride: "" }); }}>
                        + Link Part
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
