"use client";
import { useState, useEffect } from "react";
import { useRole } from "@/lib/role";
import { useRouter } from "next/navigation";

const blank = { email: "", password: "", role: "admin" };

export default function UsersPage() {
  const role = useRole();
  const router = useRouter();
  const [users,     setUsers]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState({});
  const [deleting,  setDeleting]  = useState({});
  const [roles,     setRoles]     = useState({});
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState(blank);
  const [creating,  setCreating]  = useState(false);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");

  useEffect(() => {
    if (role === "admin") { router.push("/dashboard"); return; }
  }, [role, router]);

  const load = async () => {
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setUsers(data);
      const map = {};
      data.forEach((u) => { map[u.id] = u.role; });
      setRoles(map);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (userId) => {
    setError("");
    setSaving((s) => ({ ...s, [userId]: true }));
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ role: roles[userId] }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSuccess("Role updated");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving((s) => ({ ...s, [userId]: false }));
    }
  };

  const handleDelete = async (u) => {
    if (!confirm(`Delete user "${u.email}"? This cannot be undone.`)) return;
    setError("");
    setDeleting((d) => ({ ...d, [u.id]: true }));
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      setSuccess(`${u.email} deleted`);
      await load();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting((d) => ({ ...d, [u.id]: false }));
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSuccess(`User ${form.email} created`);
      setForm(blank);
      setShowForm(false);
      await load();
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="loading-page"><div className="spinner" /> Loading users…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Users</div>
          <div className="page-subtitle">{users.length} user{users.length !== 1 ? "s" : ""}</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(true); setError(""); }}>
          + New User
        </button>
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {showForm && (
        <div className="card mt-4">
          <div className="card-header">New User</div>
          <form onSubmit={handleCreate} className="form">
            <div className="form-row">
              <div className="field">
                <label>Email *</label>
                <input required type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="user@example.com" />
              </div>
              <div className="field">
                <label>Password *</label>
                <input required type="password" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="min. 6 characters" minLength={6} />
              </div>
            </div>
            <div className="field" style={{ maxWidth: 200 }}>
              <label>Role *</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="gap-2">
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? "Creating…" : "Create User"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(false); setForm(blank); }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card mt-4">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="bold">{u.email}</td>
                <td>
                  <select
                    value={roles[u.id] ?? "manager"}
                    onChange={(e) => setRoles((r) => ({ ...r, [u.id]: e.target.value }))}
                    style={{ minWidth: 120 }}
                  >
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>
                  <div className="gap-2">
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={saving[u.id]}
                      onClick={() => handleSave(u.id)}
                    >
                      {saving[u.id] ? "Saving…" : "Save"}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={deleting[u.id]}
                      onClick={() => handleDelete(u)}
                    >
                      {deleting[u.id] ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mt-4" style={{ padding: 16, fontSize: 13, color: "var(--muted)" }}>
        <strong>Manager</strong> — full access to all pages and actions.<br />
        <strong>Admin</strong> — view orders, customers, procurement, and print documents. Cannot create or edit products, parts, locations, suppliers, or purchase orders.
      </div>
    </div>
  );
}
