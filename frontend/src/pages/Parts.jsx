/**
 * Parts page
 * - Shows all parts with stock levels and lead times
 * - Create new part / edit existing
 * - Low-stock warnings
 */
import { useState, useEffect } from "react";
import { api } from "../api";

export default function Parts() {
  const [parts, setParts]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(null); // part object or null
  const [showForm, setShowForm] = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  const blank = { name: "", currentStock: 0, minimumStock: "", supplierLeadTime: 7, unit: "pcs" };
  const [form, setForm] = useState(blank);

  const load = async () => {
    try {
      const data = await api.parts.list();
      setParts(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(blank); setEditing(null); setShowForm(true); setError(""); };
  const openEdit   = (p)  => {
    setForm({
      name: p.name,
      currentStock: p.currentStock,
      minimumStock: p.minimumStock ?? "",
      supplierLeadTime: p.supplierLeadTime,
      unit: p.unit,
    });
    setEditing(p);
    setShowForm(true);
    setError("");
  };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (editing) {
        await api.parts.update(editing.id, form);
        setSuccess("Part updated");
      } else {
        await api.parts.create(form);
        setSuccess("Part created");
      }
      closeForm();
      await load();
      setTimeout(() => setSuccess(""), 3000);
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
      setTimeout(() => setSuccess(""), 3000);
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
                <label>Current Stock</label>
                <input type="number" min="0" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} />
              </div>
              <div className="field">
                <label>Minimum Stock (alert threshold)</label>
                <input type="number" min="0" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: e.target.value })} placeholder="optional" />
              </div>
            </div>
            <div className="field" style={{ maxWidth: 260 }}>
              <label>Supplier Lead Time (days) *</label>
              <input required type="number" min="1" value={form.supplierLeadTime} onChange={(e) => setForm({ ...form, supplierLeadTime: e.target.value })} />
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
              {parts.map((p) => (
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
