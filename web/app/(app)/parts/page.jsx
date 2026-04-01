"use client";
/**
 * Parts page
 * - Shows all parts with stock levels and lead times
 * - Create new part / edit existing
 * - Low-stock warnings
 */
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";

export default function Parts() {
  const [parts, setParts]         = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState(null); // part object or null
  const [showForm, setShowForm]   = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");
  const successTimer = useRef(null);
  const [search, setSearch]       = useState("");
  const [stockFilter, setStockFilter] = useState("all"); // all | low | critical | ok
  const [sortBy, setSortBy]       = useState("name-asc"); // name-asc | name-desc | stock-asc | stock-desc | lead-asc | lead-desc

  const blank = { name: "", minimumStock: "", supplierLeadTime: 7, unit: "pcs", locationStocks: [] };
  const [form, setForm] = useState(blank);

  const load = async () => {
    try {
      const [data, locs] = await Promise.all([api.parts.list(), api.locations.list()]);
      setParts(data);
      setLocations(locs.filter(l => l.isActive));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(blank); setEditing(null); setShowForm(true); setError(""); };
  const openEdit   = (p)  => {
    setForm({
      name: p.name,
      minimumStock: p.minimumStock ?? "",
      supplierLeadTime: p.supplierLeadTime,
      unit: p.unit,
      locationStocks: (p.locationStocks ?? []).map(ls => ({
        locationId: ls.locationId ?? ls.location?.id,
        quantity:   ls.quantity,
      })),
    });
    setEditing(p);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const locationStocks = form.locationStocks
        .map(ls => ({ locationId: Number(ls.locationId), quantity: Number(ls.quantity) }))
        .filter(ls => ls.quantity > 0);
      const currentStock = locationStocks.reduce((sum, ls) => sum + ls.quantity, 0);
      const payload = { ...form, currentStock, locationStocks };
      if (editing) {
        await api.parts.update(editing.id, payload);
        setSuccess("Part updated");
      } else {
        await api.parts.create(payload);
        setSuccess("Part created");
      }
      closeForm();
      await load();
      clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (part) => {
    if (!confirm(`Delete "${part.name}"?`)) return;
    try {
      await api.parts.delete(part.id);
      setSuccess(`"${part.name}" deleted`);
      await load();
      clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  // Visual stock bar: 0–100% relative to minimumStock * 3 (or 100 if no min)
  const stockPct = (p) => {
    const cap = p.minimumStock ? p.minimumStock * 3 : 100;
    return Math.min(100, (p.currentStock / cap) * 100);
  };
  const stockClass = (p) => {
    if (!p.minimumStock) return "stock-ok";
    if (p.currentStock === 0) return "stock-critical";
    if (p.currentStock <= p.minimumStock) return "stock-low";
    return "stock-ok";
  };

  if (loading) return <div className="loading-page"><div className="spinner" /> Loading parts…</div>;

  const lowStock = parts.filter((p) => p.minimumStock && p.currentStock <= p.minimumStock);

  const visibleParts = parts
    .filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (stockFilter === "critical") return p.currentStock === 0;
      if (stockFilter === "low")      return p.minimumStock && p.currentStock > 0 && p.currentStock <= p.minimumStock;
      if (stockFilter === "ok")       return !p.minimumStock || p.currentStock > p.minimumStock;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "name-asc")    return a.name.localeCompare(b.name);
      if (sortBy === "name-desc")   return b.name.localeCompare(a.name);
      if (sortBy === "stock-asc")   return a.currentStock - b.currentStock;
      if (sortBy === "stock-desc")  return b.currentStock - a.currentStock;
      if (sortBy === "lead-asc")    return a.supplierLeadTime - b.supplierLeadTime;
      if (sortBy === "lead-desc")   return b.supplierLeadTime - a.supplierLeadTime;
      return 0;
    });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Parts & Stock</div>
          <div className="page-subtitle">{parts.length} parts · {lowStock.length} low-stock alerts</div>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Part</button>
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Low-stock alert banner */}
      {lowStock.length > 0 && (
        <div className="alert alert-warning">
          Low stock: {lowStock.map((p) => p.name).join(", ")}
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && (
        <div className="card mt-4">
          <div className="card-header">
            {editing ? `Edit "${editing.name}"` : "New Part"}
          </div>
          <form onSubmit={handleSubmit} className="form">
            <div className="form-row">
              <div className="field">
                <label>Name *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ball Bearing 6205" />
              </div>
              <div className="field">
                <label>Unit</label>
                <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                  {["pcs", "kg", "m", "L", "box"].map((u) => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Minimum Stock (alert threshold)</label>
                <input type="number" min="0" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: e.target.value })} placeholder="optional" />
              </div>
              <div className="field" style={{ maxWidth: 260 }}>
                <label>Supplier Lead Time (days) *</label>
                <input required type="number" min="1" value={form.supplierLeadTime} onChange={(e) => setForm({ ...form, supplierLeadTime: e.target.value })} />
              </div>
            </div>

            {/* ── Stock by location ── */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: "flex", alignItems: "center", gap: 12 }}>
                Stock by Location
                {form.locationStocks.length > 0 && (
                  <span style={{ fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
                    Total: <strong style={{ color: "inherit" }}>
                      {form.locationStocks.reduce((s, ls) => s + (Number(ls.quantity) || 0), 0)} {form.unit}
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
                    <p className="muted" style={{ fontSize: 13 }}>No stock assigned. Click "Add Location" to assign stock to a location.</p>
                  )}
                </>
              )}
            </div>

            <div className="gap-2">
              <button type="submit" className="btn btn-primary">{editing ? "Save Changes" : "Create Part"}</button>
              <button type="button" className="btn btn-ghost" onClick={closeForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Parts table */}
      <div className="card mt-4">
        <div style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Search parts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: "1 1 180px", minWidth: 0 }}
          />
          <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} style={{ flex: "0 0 auto" }}>
            <option value="all">All stock levels</option>
            <option value="critical">Critical (0 stock)</option>
            <option value="low">Low stock</option>
            <option value="ok">OK</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ flex: "0 0 auto" }}>
            <option value="name-asc">Name A→Z</option>
            <option value="name-desc">Name Z→A</option>
            <option value="stock-asc">Stock ↑</option>
            <option value="stock-desc">Stock ↓</option>
            <option value="lead-asc">Lead time ↑</option>
            <option value="lead-desc">Lead time ↓</option>
          </select>
          {(search || stockFilter !== "all") && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(""); setStockFilter("all"); }}>
              Clear
            </button>
          )}
          <span className="muted" style={{ fontSize: 13 }}>{visibleParts.length} of {parts.length}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Available Stock</th>
                <th>Min Stock</th>
                <th>Lead Time</th>
                <th>Used in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {parts.length === 0 && (
                <tr><td colSpan={6}>
                  <div className="empty"><div className="empty-icon">🔩</div><p>No parts yet. Create one above.</p></div>
                </td></tr>
              )}
              {visibleParts.length === 0 && parts.length > 0 && (
                <tr><td colSpan={6}>
                  <div className="empty"><div className="empty-icon">🔍</div><p>No parts match your filters.</p></div>
                </td></tr>
              )}
              {visibleParts.map((p) => (
                <tr key={p.id}>
                  <td className="bold">{p.name}</td>
                  <td>
                    <div className="stock-bar-wrap">
                      <div className="stock-bar">
                        <div className={`stock-bar-fill ${stockClass(p)}`} style={{ width: `${stockPct(p)}%` }} />
                      </div>
                      <span className={stockClass(p) === "stock-ok" ? "success" : stockClass(p) === "stock-low" ? "warning" : "danger"}>
                        {p.currentStock} {p.unit}
                      </span>
                    </div>
                    {p.locationStocks?.length > 0 && (
                      <div style={{ fontSize: "11px", color: "#888", marginTop: "3px" }}>
                        {p.locationStocks.map(ls => (
                          <span key={ls.id} style={{ marginRight: "8px" }}>
                            {ls.location.code ?? ls.location.name}: {ls.quantity}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="muted">{p.minimumStock != null ? `${p.minimumStock} ${p.unit}` : "—"}</td>
                  <td>{p.supplierLeadTime}d</td>
                  <td className="muted">{p._count?.productParts ?? 0} product(s)</td>
                  <td>
                    <div className="gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
