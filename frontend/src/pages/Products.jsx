/**
 * Products page
 * BOM uses a yield model:
 *   materialQty      = how many units of material
 *   productsPerBatch = how many products that amount makes
 *
 * e.g. "1 sheet of HPL makes 5 t700" → materialQty=1, productsPerBatch=5
 *      "4 pins per 1 t700"            → materialQty=4, productsPerBatch=1
 */
import { useState, useEffect } from "react";
import { api } from "../api";

// Human-readable BOM ratio label, e.g. "1 sheet per 5 products" or "4 pins per product"
function bomLabel(pp) {
  const unit = pp.part.unit;
  if (pp.productsPerBatch === 1) {
    return `${pp.materialQty} ${unit} per product`;
  }
  return `${pp.materialQty} ${unit} per ${pp.productsPerBatch} products`;
}

// Minimum stock needed for 1 product (for the "In Stock" status check)
function neededFor1(pp) {
  return Math.ceil(pp.materialQty / pp.productsPerBatch);
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [parts, setParts]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  const blank = { name: "", dailyCapacity: 100, description: "", parts: [] };
  const [form, setForm] = useState(blank);

  const load = async () => {
    try {
      const [prods, pParts] = await Promise.all([api.products.list(), api.parts.list()]);
      setProducts(prods);
      setParts(pParts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(blank); setEditing(null); setShowForm(true); setError(""); };
  const openEdit   = (prod) => {
    setForm({
      name: prod.name,
      dailyCapacity: prod.dailyCapacity,
      description: prod.description,
      parts: prod.productParts.map((pp) => ({
        partId: pp.partId,
        materialQty: pp.materialQty,
        productsPerBatch: pp.productsPerBatch,
      })),
    });
    setEditing(prod);
    setShowForm(true);
    setError("");
  };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  // BOM helpers
  const addBomRow = () => {
    const unused = parts.find((p) => !form.parts.some((fp) => Number(fp.partId) === p.id));
    if (!unused) return;
    setForm((f) => ({ ...f, parts: [...f.parts, { partId: unused.id, materialQty: 1, productsPerBatch: 1 }] }));
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
      const payload = {
        ...form,
        dailyCapacity: Number(form.dailyCapacity),
        parts: form.parts.map((p) => ({
          partId: Number(p.partId),
          materialQty: Number(p.materialQty),
          productsPerBatch: Number(p.productsPerBatch),
        })),
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

      {/* ── Create / Edit form ── */}
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
            <div className="field">
              <label>Description</label>
              <textarea value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description" />
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
                For each material: enter how many units you need and how many products that covers.
                Example: 1 sheet covers 5 products → materialQty=1, productsPerBatch=5.
              </div>

              {/* Column headers */}
              {form.parts.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 140px auto", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Material</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Qty</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Covers N products</span>
                  <span />
                </div>
              )}

              {form.parts.map((row, idx) => {
                const part = parts.find((p) => p.id === Number(row.partId));
                return (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 110px 140px auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
                    {/* Material selector */}
                    <select
                      value={row.partId}
                      onChange={(e) => updateBomRow(idx, "partId", Number(e.target.value))}
                    >
                      {parts.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                      ))}
                    </select>

                    {/* How many units of material */}
                    <input
                      type="number" min="1"
                      value={row.materialQty}
                      onChange={(e) => updateBomRow(idx, "materialQty", e.target.value)}
                      title={`How many ${part?.unit ?? "units"} of material`}
                    />

                    {/* How many products that covers */}
                    <input
                      type="number" min="1"
                      value={row.productsPerBatch}
                      onChange={(e) => updateBomRow(idx, "productsPerBatch", e.target.value)}
                      title="How many products can be made from the quantity above"
                    />

                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeBomRow(idx)}>✕</button>
                  </div>
                );
              })}

              {/* Live preview of the ratio */}
              {form.parts.length > 0 && (
                <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 14px", fontSize: 12, marginTop: 4 }}>
                  {form.parts.map((row, idx) => {
                    const part = parts.find((p) => p.id === Number(row.partId));
                    const qty = Number(row.materialQty) || 1;
                    const per = Number(row.productsPerBatch) || 1;
                    const perProduct = (qty / per).toFixed(4).replace(/\.?0+$/, "");
                    return (
                      <div key={idx} style={{ marginBottom: 2 }}>
                        <span style={{ color: "var(--muted)" }}>
                          {qty} {part?.unit ?? "unit"} of <strong>{part?.name ?? "?"}</strong>
                          {per > 1 ? ` makes ${per} products` : " per product"}
                          {" → "}
                        </span>
                        <strong>{perProduct} {part?.unit ?? "unit"}{per > 1 ? "" : "s"} consumed per product</strong>
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

            <div className="gap-2">
              <button type="submit" className="btn btn-primary">{editing ? "Save Changes" : "Create Product"}</button>
              <button type="button" className="btn btn-ghost" onClick={closeForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Products list ── */}
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
            {/* BOM table */}
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
