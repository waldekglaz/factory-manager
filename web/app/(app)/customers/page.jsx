"use client";
import React, { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useRole } from "@/lib/role";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Customers() {
  const role = useRole();
  const [customers, setCustomers] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [expanded,  setExpanded]  = useState(null); // customer id showing order history
  const [history,   setHistory]   = useState({});   // { customerId: [orders] }
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");
  const successTimer = useRef(null);

  const blank = { name: "", email: "", phone: "", address: "", notes: "" };
  const [form, setForm] = useState(blank);

  const load = async () => {
    try {
      setCustomers(await api.customers.list());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(blank); setEditing(null); setShowForm(true); setError(""); };
  const openEdit   = (c) => {
    setForm({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", address: c.address ?? "", notes: c.notes ?? "" });
    setEditing(c);
    setShowForm(true);
    setError("");
  };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        name:    form.name.trim(),
        email:   form.email   || null,
        phone:   form.phone   || null,
        address: form.address || null,
        notes:   form.notes   || null,
      };
      if (editing) {
        await api.customers.update(editing.id, payload);
        setSuccess("Customer updated");
      } else {
        await api.customers.create(payload);
        setSuccess("Customer created");
      }
      closeForm();
      await load();
      clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (c) => {
    if (!confirm(`Delete customer "${c.name}"?`)) return;
    try {
      await api.customers.delete(c.id);
      setSuccess(`"${c.name}" deleted`);
      await load();
      clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleHistory = async (c) => {
    if (expanded === c.id) { setExpanded(null); return; }
    setExpanded(c.id);
    if (!history[c.id]) {
      try {
        const orders = await api.customers.orders(c.id);
        setHistory((h) => ({ ...h, [c.id]: orders }));
      } catch (err) {
        setError(err.message);
        setExpanded(null);
      }
    }
  };

  if (loading) return <div className="loading-page"><div className="spinner" /> Loading customers…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Customers</div>
          <div className="page-subtitle">{customers.length} customers</div>
        </div>
        {role === "manager" && (
          <button className="btn btn-primary" onClick={openCreate}>+ New Customer</button>
        )}
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {showForm && (
        <div className="card mt-4">
          <div className="card-header">{editing ? `Edit "${editing.name}"` : "New Customer"}</div>
          <form onSubmit={handleSubmit} className="form">
            <div className="form-row">
              <div className="field">
                <label>Name *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Company or person name" />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="optional" />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Phone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="optional" />
              </div>
              <div className="field">
                <label>Address</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="optional" />
              </div>
            </div>
            <div className="field">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" />
            </div>
            <div className="gap-2">
              <button type="submit" className="btn btn-primary">{editing ? "Save Changes" : "Create Customer"}</button>
              <button type="button" className="btn btn-ghost" onClick={closeForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {customers.length === 0 && !showForm ? (
        <div className="card mt-4">
          <div className="empty">
            <div className="empty-icon">👥</div>
            <p>No customers yet. Click "New Customer" to add one.</p>
          </div>
        </div>
      ) : (
        <div className="card mt-4">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Orders</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <React.Fragment key={c.id}>
                  <tr>
                    <td className="bold">{c.name}</td>
                    <td className="muted">{c.email ?? "—"}</td>
                    <td className="muted">{c.phone ?? "—"}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleHistory(c)}>
                        {c._count.orders} order{c._count.orders !== 1 ? "s" : ""}
                        {c._count.orders > 0 ? (expanded === c.id ? " ▲" : " ▼") : ""}
                      </button>
                    </td>
                    <td>
                      {role === "manager" && (
                        <div className="gap-2">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c)}>Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr key={`${c.id}-history`}>
                      <td colSpan={5} style={{ padding: 0 }}>
                        <div style={{ background: "#f8fafc", padding: "12px 16px" }}>
                          {!history[c.id] ? (
                            <span className="muted">Loading…</span>
                          ) : history[c.id].length === 0 ? (
                            <span className="muted">No orders yet.</span>
                          ) : (
                            <table>
                              <thead>
                                <tr><th>#</th><th>Product</th><th>Qty</th><th>Status</th><th>End Date</th></tr>
                              </thead>
                              <tbody>
                                {history[c.id].map((o) => (
                                  <tr key={o.id}>
                                    <td className="muted mono">#{o.id}</td>
                                    <td>{o.product.name}</td>
                                    <td>{o.quantity}</td>
                                    <td><span className={`badge badge-${o.status}`}>{o.status.replace("_", " ")}</span></td>
                                    <td className="muted">{fmtDate(o.productionEndDate)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
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
    </div>
  );
}
