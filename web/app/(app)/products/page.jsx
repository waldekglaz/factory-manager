"use client";
/**
 * Products page
 * BOM uses a yield model + optional scrap factor:
 *   materialQty      = how many units of material
 *   productsPerBatch = how many products that amount makes
 *   scrapFactor      = waste padding (0.05 = 5% extra ordered)
 */
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

function bomLabel(pp) {
  const unit = pp.part.unit;
  const scrap = pp.scrapFactor ? ` +${(pp.scrapFactor * 100).toFixed(0)}% scrap` : "";
  if (pp.productsPerBatch === 1) return `${pp.materialQty} ${unit} per product${scrap}`;
  return `${pp.materialQty} ${unit} per ${pp.productsPerBatch} products${scrap}`;
}

function neededFor1(pp) {
  return Math.ceil((pp.materialQty / pp.productsPerBatch) * (1 + (pp.scrapFactor ?? 0)));
}

export default function Products() {
  const [products, setProducts]   = useState([]);
  const [parts, setParts]         = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState(null);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");

  const blank = { name: "", dailyCapacity: 100, description: "", sellingPrice: "", parts: [], locationStocks: [] };
  const [form, setForm] = useState(blank);

  const load = async () => {
    try {
      const [prods, pParts, locs] = await Promise.all([api.products.list(), api.parts.list(), api.locations.list()]);
      setProducts(prods);
      setParts(pParts);
      setLocations(locs.filter(l => l.isActive));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(blank); setEditing(null); setShowForm(true); setError(""); };
  const openEdit   = (prod) => {
    setForm({
      name:          prod.name,
      dailyCapacity: prod.dailyCapacity,
      description:   prod.description,
      sellingPrice:  prod.sellingPrice ?? "",
      parts: prod.productParts.map((pp) => ({
        partId:           pp.partId,
        materialQty:      pp.materialQty,
        productsPerBatch: pp.productsPerBatch,
        scrapFactor:      Math.round((pp.scrapFactor ?? 0) * 100),
      })),
      locationStocks: (prod.locationStocks ?? []).map(ls => ({
        locationId: ls.locationId ?? ls.location?.id,
        quantity:   ls.quantity,
      })),
    });
    setEditing(prod);
    setShowForm(true);
    setError("");
  };

  // ── location stock helpers ─────────────────────────────────────────────────
  const addLocationRow = () => {
    const used = new Set(form.locationStocks.map(ls => Number(ls.locationId)));
    const free = locations.find(l => !used.has(l.id));
    if (!free) return;
    setForm(f => ({ ...f, locationStocks: [...f.locationStocks, { locationId: free.id, quantity: 0 }] }));
  };
  const removeLocationRow = (idx) =>
    setForm(f => ({ ...f, locationStocks: f.locationStocks.filter((_, i) => i !== idx) }));
  const updateLocationRow = (idx, field, val) =>
    setForm(f => ({
      ...f,
      locationStocks: f.locationStocks.map((r, i) => i === idx ? { ...r, [field]: val } : r),
    }));
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const addBomRow = () => {
    const unused = parts.find((p) => !form.parts.some((fp) => Number(fp.partId) === p.id));
    if (!unused) return;
    setForm((f) => ({
      ...f,
      parts: [...f.parts, { partId: unused.id, materialQty: 1, productsPerBatch: 1, scrapFactor: 0 }],
    }));
  };
  const removeBomRow = (idx) =>
    setForm((f) => ({ ...f, parts: f.parts.filter((_, i) => i !== idx) }));
  const updateBomRow = (idx, field, val) =>
    setForm((f) => ({
      ...f,
      parts: f.parts.map((r, i) => (i === idx ? { ...r, [field]: val } : r)),
    }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.parts.length === 0) { setError("Add at least one material to the BOM"); return; }
    try {
      const locationStocks = form.locationStocks
        .map(ls => ({ locationId: Number(ls.locationId), quantity: Number(ls.quantity) }))
        .filter(ls => ls.quantity > 0);
      const finishedStock = locationStocks.reduce((sum, ls) => sum + ls.quantity, 0);
      const payload = {
        name:          form.name,
        dailyCapacity: Number(form.dailyCapacity),
        description:   form.description,
        sellingPrice:  form.sellingPrice !== "" ? Number(form.sellingPrice) : null,
        finishedStock,
        parts: form.parts.map((p) => ({
          partId:           Number(p.partId),
          materialQty:      Number(p.materialQty),
          productsPerBatch: Number(p.productsPerBatch),
          scrapFactor:      Number(p.scrapFactor ?? 0) / 100,
        })),
        locationStocks,
      };
      if (editing) {
        await api.products.update(editing.id, payload);
        setSuccess("Product updated");
      } else {
        await api.products.create(payload);
        setSuccess("Product created");
      }
      closeForm();
      await load();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (prod) => {
    if (!confirm(`Delete "${prod.name}"?`)) return;
    try {
      await api.products.delete(prod.id);
      setSuccess(`"${prod.name}" deleted`);
      await load();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="loading-page"><div className="spinner" /> Loading products…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Products</div>
          <div className="page-subtitle">{products.length} products configured</div>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ New Product</button>
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {showForm && (
        <div className="card mt-4">
          <div className="card-header">
            {editing ? `Edit "${editing.name}"` : "New Product"}
          </div>
          <form onSubmit={handleSubmit} className="form">
            <div className="form-row">
              <div className="field">
                <label>Product Name *</label>
                <input required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. t700" />
              </div>
              <div className="field">
                <label>Daily Capacity (units/day) *</label>
                <input required type="number" min="1" step="1" value={form.dailyCapacity}
                  onChange={(e) => setForm({ ...form, dailyCapacity: e.target.value })}
                  placeholder="e.g. 200" />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Description</label>
                <textarea value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional description" />
              </div>
              <div className="field" style={{ maxWidth: 200 }}>
                <label>Selling Price (per unit)</label>
                <input type="number" min="0" step="0.01" value={form.sellingPrice}
                  onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                  placeholder="e.g. 49.99" />
              </div>
            </div>

            {/* ── Bill of Materials ── */}
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                Bill of Materials
                <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                  ({form.parts.length} material{form.parts.length !== 1 ? "s" : ""})
                </span>
              </div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Enter how many units of material you need and how many products that covers. Add a scrap % to pad for waste.
              </div>

              {form.parts.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 130px 90px auto", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Material</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Qty</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Covers N products</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Scrap %</span>
                  <span />
                </div>
              )}

              {form.parts.map((row, idx) => {
                const part = parts.find((p) => p.id === Number(row.partId));
                return (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 90px 130px 90px auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
                    <select
                      value={row.partId}
                      onChange={(e) => updateBomRow(idx, "partId", Number(e.target.value))}
                    >
                      {parts.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                      ))}
                    </select>
                    <input type="number" min="1"
                      value={row.materialQty}
                      onChange={(e) => updateBomRow(idx, "materialQty", e.target.value)}
                      title={`How many ${part?.unit ?? "units"} of material`}
                    />
                    <input type="number" min="1"
                      value={row.productsPerBatch}
                      onChange={(e) => updateBomRow(idx, "productsPerBatch", e.target.value)}
                      title="How many products can be made from the quantity above"
                    />
                    <input type="number" min="0" max="100" step="1"
                      value={row.scrapFactor ?? 0}
                      onChange={(e) => updateBomRow(idx, "scrapFactor", e.target.value)}
                      title="Waste percentage (e.g. 5 = order 5% extra)"
                      placeholder="0"
                    />
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeBomRow(idx)}>✕</button>
                  </div>
                );
              })}

              {form.parts.length > 0 && (
                <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 14px", fontSize: 12, marginTop: 4 }}>
                  {form.parts.map((row, idx) => {
                    const part = parts.find((p) => p.id === Number(row.partId));
                    const qty   = Number(row.materialQty) || 1;
                    const per   = Number(row.productsPerBatch) || 1;
                    const scrap = Number(row.scrapFactor ?? 0) / 100;
                    const base  = qty / per;
                    const withScrap = base * (1 + scrap);
                    return (
                      <div key={idx} style={{ marginBottom: 2 }}>
                        <span style={{ color: "var(--muted)" }}>
                          {qty} {part?.unit ?? "unit"} of <strong>{part?.name ?? "?"}</strong>
                          {per > 1 ? ` makes ${per} products` : " per product"}
                          {scrap > 0 ? ` +${(scrap * 100).toFixed(0)}% scrap` : ""}
                          {" → "}
                        </span>
                        <strong>
                          {withScrap.toFixed(4).replace(/\.?0+$/, "")} {part?.unit ?? "unit"} consumed per product
                        </strong>
                      </div>
                    );
                  })}
                </div>
              )}

              {parts.length > form.parts.length && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={addBomRow}>
                  + Add Material
                </button>
              )}
              {parts.length === 0 && (
                <p className="muted" style={{ fontSize: 13 }}>Go to Materials / Parts first and create your materials.</p>
              )}
            </div>

            {/* ── Finished goods by location ── */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: "flex", alignItems: "center", gap: 12 }}>
                Finished Goods in Stock
                {form.locationStocks.length > 0 && (
                  <span style={{ fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
                    Total: <strong style={{ color: "inherit" }}>
                      {form.locationStocks.reduce((s, ls) => s + (Number(ls.quantity) || 0), 0)} units
                    </strong>
                  </span>
                )}
              </div>
              {locations.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>No locations set up yet. Go to Locations to create storage locations first.</p>
              ) : (
                <>
                  {form.locationStocks.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 120px auto", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Location</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Quantity</span>
                      <span />
                    </div>
                  )}
                  {form.locationStocks.map((row, idx) => (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 120px auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
                      <select
                        value={row.locationId}
                        onChange={(e) => updateLocationRow(idx, "locationId", e.target.value)}
                      >
                        {locations.map(l => (
                          <option key={l.id} value={l.id}>{l.name}{l.code ? ` (${l.code})` : ""}</option>
                        ))}
                      </select>
                      <input
                        type="number" min="0"
                        value={row.quantity}
                        onChange={(e) => updateLocationRow(idx, "quantity", e.target.value)}
                      />
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => removeLocationRow(idx)}>✕</button>
                    </div>
                  ))}
                  {form.locationStocks.length < locations.length && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={addLocationRow}>+ Add Location</button>
                  )}
                  {form.locationStocks.length === 0 && (
                    <p className="muted" style={{ fontSize: 13 }}>No finished goods in stock. Add a location row to record units ready to ship.</p>
                  )}
                </>
              )}
            </div>

            <div className="gap-2">
              <button type="submit" className="btn btn-primary">{editing ? "Save Changes" : "Create Product"}</button>
              <button type="button" className="btn btn-ghost" onClick={closeForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {products.length === 0 && !showForm ? (
        <div className="card mt-4">
          <div className="empty">
            <div className="empty-icon">📦</div>
            <p>No products yet. Click "New Product" to get started.</p>
          </div>
        </div>
      ) : (
        products.map((prod) => (
          <div key={prod.id} className="card mt-4">
            <div className="card-header" style={{ justifyContent: "space-between" }}>
              <div className="gap-2">
                <span>📦</span>
                <span>{prod.name}</span>
                <span className="muted" style={{ fontWeight: 400 }}>— {prod.dailyCapacity} units/day</span>
                {prod.sellingPrice != null && (
                  <span className="muted" style={{ fontWeight: 400 }}>· £{prod.sellingPrice.toFixed(2)}/unit</span>
                )}
                {prod.finishedStock > 0 && (
                  <span className="badge badge-ok" style={{ marginLeft: 4 }}>
                    {prod.finishedStock} in stock
                  </span>
                )}
              </div>
              <div className="gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(prod)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(prod)}>Delete</button>
              </div>
            </div>
            {prod.description && (
              <div style={{ padding: "8px 20px", color: "var(--muted)", fontSize: 13, borderBottom: "1px solid var(--border)" }}>
                {prod.description}
              </div>
            )}
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Usage ratio</th>
                  <th>In Stock</th>
                  <th>Lead Time</th>
                  <th>Status (1 product)</th>
                </tr>
              </thead>
              <tbody>
                {prod.productParts.map((pp) => {
                  const needed1 = neededFor1(pp);
                  const ok = pp.part.currentStock >= needed1;
                  return (
                    <tr key={pp.id}>
                      <td className="bold">{pp.part.name}</td>
                      <td className="muted">{bomLabel(pp)}</td>
                      <td className={ok ? "success" : "danger"}>
                        {pp.part.currentStock} {pp.part.unit}
                      </td>
                      <td className="muted">{pp.part.supplierLeadTime}d</td>
                      <td>
                        <span className={`badge ${ok ? "badge-ok" : "badge-shortage"}`}>
                          {ok ? "Available" : "Shortage"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
