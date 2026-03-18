/**
 * Locations page
 *
 * - List all storage locations with stock summary
 * - Create / edit / delete locations
 * - Click a location to see full stock breakdown (parts + products)
 * - Transfer stock between locations
 */

import { useEffect, useState } from "react";
import { api } from "../api";

// ── helpers ──────────────────────────────────────────────────────────────────
const EMPTY_FORM = { name: "", code: "", description: "", isRemote: false, deliveryDays: "" };

export default function Locations() {
  const [locations, setLocations]       = useState([]);
  const [selected, setSelected]         = useState(null);   // { location, stock }
  const [loading, setLoading]           = useState(true);
  const [stockLoading, setStockLoading] = useState(false);
  const [error, setError]               = useState("");

  // Create / edit form
  const [showForm, setShowForm]       = useState(false);
  const [editingId, setEditingId]     = useState(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [formError, setFormError]     = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Transfer modal
  const [showTransfer, setShowTransfer]       = useState(false);
  const [transferType, setTransferType]       = useState("parts"); // "parts" | "products"
  const [transferForm, setTransferForm]       = useState({ itemId: "", fromLocationId: "", toLocationId: "", quantity: "" });
  const [transferError, setTransferError]     = useState("");
  const [transferLoading, setTransferLoading] = useState(false);

  // ── load ──────────────────────────────────────────────────────────────────
  async function load() {
    try {
      setLoading(true);
      const data = await api.locations.list();
      setLocations(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function loadStock(loc) {
    setStockLoading(true);
    setSelected(null);
    try {
      const stock = await api.locations.stock(loc.id);
      setSelected({ location: loc, stock });
    } catch (e) {
      setError(e.message);
    } finally {
      setStockLoading(false);
    }
  }

  // ── create / edit ─────────────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(loc, e) {
    e.stopPropagation();
    setEditingId(loc.id);
    setForm({
      name:         loc.name,
      code:         loc.code         ?? "",
      description:  loc.description  ?? "",
      isRemote:     loc.isRemote     ?? false,
      deliveryDays: loc.deliveryDays != null ? String(loc.deliveryDays) : "",
    });
    setFormError("");
    setShowForm(true);
  }

  async function submitForm(e) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    setFormLoading(true);
    setFormError("");
    try {
      const payload = {
        ...form,
        isRemote:     form.isRemote,
        deliveryDays: form.isRemote && form.deliveryDays !== "" ? Number(form.deliveryDays) : null,
      };
      if (editingId) {
        await api.locations.update(editingId, payload);
      } else {
        await api.locations.create(payload);
      }
      setShowForm(false);
      await load();
      // Refresh selected if we just edited it
      if (editingId && selected?.location.id === editingId) {
        const refreshed = await api.locations.stock(editingId);
        setSelected(s => s ? { ...s, stock: refreshed } : null);
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  }

  async function toggleActive(loc, e) {
    e.stopPropagation();
    try {
      await api.locations.update(loc.id, { isActive: !loc.isActive });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteLocation(loc, e) {
    e.stopPropagation();
    const total = (loc.totalPartUnits ?? 0) + (loc.totalProductUnits ?? 0);
    if (total > 0) {
      setError(`Cannot delete "${loc.name}" — it still holds ${total} unit(s). Transfer all stock first.`);
      return;
    }
    if (!window.confirm(`Delete location "${loc.name}"?`)) return;
    try {
      await api.locations.delete(loc.id);
      if (selected?.location.id === loc.id) setSelected(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  // ── transfer ──────────────────────────────────────────────────────────────
  function openTransfer() {
    setTransferForm({ itemId: "", fromLocationId: selected?.location.id ?? "", toLocationId: "", quantity: "" });
    setTransferType("parts");
    setTransferError("");
    setShowTransfer(true);
  }

  async function submitTransfer(e) {
    e.preventDefault();
    const { itemId, fromLocationId, toLocationId, quantity } = transferForm;
    if (!itemId || !fromLocationId || !toLocationId || !quantity) {
      setTransferError("All fields are required"); return;
    }
    if (Number(fromLocationId) === Number(toLocationId)) {
      setTransferError("Source and destination must be different"); return;
    }
    setTransferLoading(true);
    setTransferError("");
    try {
      if (transferType === "parts") {
        await api.locations.transferParts({
          partId: Number(itemId),
          fromLocationId: Number(fromLocationId),
          toLocationId:   Number(toLocationId),
          quantity:       Number(quantity),
        });
      } else {
        await api.locations.transferProducts({
          productId:      Number(itemId),
          fromLocationId: Number(fromLocationId),
          toLocationId:   Number(toLocationId),
          quantity:       Number(quantity),
        });
      }
      setShowTransfer(false);
      await load();
      // Refresh selected stock
      if (selected) {
        const refreshed = await api.locations.stock(selected.location.id);
        setSelected(s => s ? { ...s, stock: refreshed } : null);
      }
    } catch (err) {
      setTransferError(err.message);
    } finally {
      setTransferLoading(false);
    }
  }

  // ── collect all parts / products across all locations for transfer dropdowns
  const allParts    = [];
  const allProducts = [];
  locations.forEach(loc => {
    // We don't have item details here — they come from the selected stock view
  });
  const transferItems = selected?.stock
    ? (transferType === "parts" ? selected.stock.partStocks : selected.stock.productStocks)
    : [];

  // ── render ────────────────────────────────────────────────────────────────
  if (loading) return <p className="text-muted">Loading locations…</p>;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1>Storage Locations</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ New Location</button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
          {error}
          <button onClick={() => setError("")} style={{ marginLeft: "1rem", background: "none", border: "none", cursor: "pointer", fontWeight: "bold" }}>✕</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "1.5rem", alignItems: "start" }}>

        {/* ── Locations list ────────────────────────────────────────────── */}
        <div>
          {locations.length === 0 ? (
            <div className="empty">
              <p>No locations yet.</p>
              <p>Create your first storage location to start tracking where materials and products are stored.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {locations.map(loc => {
                const isSelected = selected?.location.id === loc.id;
                const total = (loc.totalPartUnits ?? 0) + (loc.totalProductUnits ?? 0);
                return (
                  <div
                    key={loc.id}
                    onClick={() => loadStock(loc)}
                    style={{
                      border: `2px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                      borderRadius: "0.5rem",
                      padding: "0.875rem 1rem",
                      cursor: "pointer",
                      background: isSelected ? "var(--primary-light, #f0f4ff)" : "var(--card-bg)",
                      transition: "border-color 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <strong style={{ fontSize: "1rem" }}>{loc.name}</strong>
                          {loc.code && <span className="badge badge-planned">{loc.code}</span>}
                          {loc.isRemote && (
                            <span className="badge badge-warning">
                              Remote{loc.deliveryDays ? ` · ${loc.deliveryDays}d` : ""}
                            </span>
                          )}
                          {!loc.isActive && <span className="badge badge-cancelled">Inactive</span>}
                        </div>
                        {loc.description && (
                          <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>{loc.description}</p>
                        )}
                        <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--muted)", display: "flex", gap: "1rem" }}>
                          <span>Parts: <strong>{loc._count?.partStocks ?? 0}</strong> SKUs / <strong>{loc.totalPartUnits ?? 0}</strong> units</span>
                          <span>Products: <strong>{loc._count?.productStocks ?? 0}</strong> SKUs / <strong>{loc.totalProductUnits ?? 0}</strong> units</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={(e) => openEdit(loc, e)}
                          title="Edit location"
                        >Edit</button>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={(e) => toggleActive(loc, e)}
                          title={loc.isActive ? "Mark inactive" : "Mark active"}
                        >{loc.isActive ? "Deactivate" : "Activate"}</button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={(e) => deleteLocation(loc, e)}
                          title={total > 0 ? "Cannot delete — has stock" : "Delete location"}
                          disabled={total > 0}
                        >Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Stock detail panel ────────────────────────────────────────── */}
        <div>
          {stockLoading && <p className="text-muted">Loading stock…</p>}

          {!stockLoading && !selected && (
            <div className="empty" style={{ padding: "2rem" }}>
              <p>Select a location to see its stock breakdown.</p>
            </div>
          )}

          {!stockLoading && selected && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div>
                  <h2 style={{ margin: 0 }}>{selected.location.name}</h2>
                  {selected.location.isRemote && (
                    <span style={{ fontSize: 12, color: "#b45309" }}>
                      Remote location · {selected.location.deliveryDays ?? 0} day delivery
                    </span>
                  )}
                </div>
                <button className="btn btn-secondary" onClick={openTransfer}>Transfer Stock</button>
              </div>

              {/* Parts */}
              <h3 style={{ marginBottom: "0.5rem", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                Materials / Parts ({selected.stock.partStocks?.length ?? 0})
              </h3>
              {selected.stock.partStocks?.length === 0 ? (
                <p className="text-muted" style={{ marginBottom: "1rem" }}>No parts stock in this location.</p>
              ) : (
                <table className="table" style={{ marginBottom: "1.5rem" }}>
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th style={{ textAlign: "right" }}>Qty</th>
                      <th>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.stock.partStocks.map(row => (
                      <tr key={row.id}>
                        <td>{row.part.name}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{row.quantity}</td>
                        <td>{row.part.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Products */}
              <h3 style={{ marginBottom: "0.5rem", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                Finished Goods ({selected.stock.productStocks?.length ?? 0})
              </h3>
              {selected.stock.productStocks?.length === 0 ? (
                <p className="text-muted">No finished goods in this location.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ textAlign: "right" }}>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.stock.productStocks.map(row => (
                      <tr key={row.id}>
                        <td>{row.product.name}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{row.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Create / Edit form modal ──────────────────────────────────────────── */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
          onClick={() => setShowForm(false)}>
          <div style={{ background: "#fff", borderRadius: 10, padding: 28, width: 480, maxWidth: "95vw", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>
              {editingId ? "Edit Location" : "New Location"}
            </div>
            {formError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{formError}</div>}
            <form onSubmit={submitForm}>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Name *</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Unit 1, Warehouse B - Shelf 3"
                  required
                  style={{ width: "100%" }}
                />
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Code <span style={{ color: "#888", fontWeight: 400 }}>(optional short label)</span></label>
                <input
                  className="input"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="e.g. U1, WH-B3"
                  style={{ width: "100%" }}
                />
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Description</label>
                <input
                  className="input"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional notes about this location"
                  style={{ width: "100%" }}
                />
              </div>
              <div className="field" style={{ marginBottom: form.isRemote ? 12 : 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.isRemote}
                    onChange={e => setForm(f => ({ ...f, isRemote: e.target.checked, deliveryDays: e.target.checked ? f.deliveryDays : "" }))}
                  />
                  Remote location <span style={{ color: "#888", fontWeight: 400 }}>(stock needs transit time before use)</span>
                </label>
              </div>
              {form.isRemote && (
                <div className="field" style={{ marginBottom: 16 }}>
                  <label>Delivery time (calendar days) *</label>
                  <input
                    type="number" min="1" step="1"
                    className="input"
                    value={form.deliveryDays}
                    onChange={e => setForm(f => ({ ...f, deliveryDays: e.target.value }))}
                    placeholder="e.g. 3"
                    required={form.isRemote}
                    style={{ width: "100%" }}
                  />
                  <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                    The planner will add this many days before stock from this location is available for production.
                  </div>
                </div>
              )}
              <div className="gap-2">
                <button type="submit" className="btn btn-primary" disabled={formLoading}>
                  {formLoading ? "Saving…" : editingId ? "Save Changes" : "Create Location"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Transfer modal ────────────────────────────────────────────────────── */}
      {showTransfer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
          onClick={() => setShowTransfer(false)}>
          <div style={{ background: "#fff", borderRadius: 10, padding: 28, width: 520, maxWidth: "95vw", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Transfer Stock</div>
            {transferError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{transferError}</div>}

            <div className="field" style={{ marginBottom: 12 }}>
              <label>Stock type</label>
              <div style={{ display: "flex", gap: "1rem", marginTop: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                  <input
                    type="radio" value="parts"
                    checked={transferType === "parts"}
                    onChange={() => { setTransferType("parts"); setTransferForm(f => ({ ...f, itemId: "" })); }}
                  />
                  Materials / Parts
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                  <input
                    type="radio" value="products"
                    checked={transferType === "products"}
                    onChange={() => { setTransferType("products"); setTransferForm(f => ({ ...f, itemId: "" })); }}
                  />
                  Finished Goods
                </label>
              </div>
            </div>

            <form onSubmit={submitTransfer}>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>{transferType === "parts" ? "Part" : "Product"} *</label>
                {transferType === "parts" ? (
                  <select
                    value={transferForm.itemId}
                    onChange={e => setTransferForm(f => ({ ...f, itemId: e.target.value }))}
                    required style={{ width: "100%" }}
                  >
                    <option value="">— select a part —</option>
                    {selected?.stock.partStocks.map(row => (
                      <option key={row.partId} value={row.partId}>
                        {row.part.name} (here: {row.quantity} {row.part.unit})
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={transferForm.itemId}
                    onChange={e => setTransferForm(f => ({ ...f, itemId: e.target.value }))}
                    required style={{ width: "100%" }}
                  >
                    <option value="">— select a product —</option>
                    {selected?.stock.productStocks.map(row => (
                      <option key={row.productId} value={row.productId}>
                        {row.product.name} (here: {row.quantity})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: 12 }}>
                <div className="field">
                  <label>From location *</label>
                  <select
                    value={transferForm.fromLocationId}
                    onChange={e => setTransferForm(f => ({ ...f, fromLocationId: e.target.value }))}
                    required style={{ width: "100%" }}
                  >
                    <option value="">— select —</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}{loc.code ? ` (${loc.code})` : ""}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>To location *</label>
                  <select
                    value={transferForm.toLocationId}
                    onChange={e => setTransferForm(f => ({ ...f, toLocationId: e.target.value }))}
                    required style={{ width: "100%" }}
                  >
                    <option value="">— select —</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}{loc.code ? ` (${loc.code})` : ""}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field" style={{ marginBottom: 16 }}>
                <label>Quantity *</label>
                <input
                  type="number" min="1" step="1"
                  value={transferForm.quantity}
                  onChange={e => setTransferForm(f => ({ ...f, quantity: e.target.value }))}
                  required style={{ width: "100%" }}
                />
              </div>

              <div className="gap-2">
                <button type="submit" className="btn btn-primary" disabled={transferLoading}>
                  {transferLoading ? "Transferring…" : "Transfer"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowTransfer(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
