"use client";
import { useState, useEffect } from "react";
import { useRole } from "@/lib/role";
import { useRouter } from "next/navigation";

export default function UsersPage() {
  const role = useRole();
  const router = useRouter();
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState({});  // { userId: true }
  const [roles,   setRoles]   = useState({});  // { userId: role }
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    // Redirect admin away (middleware also blocks, this is a fallback)
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

  if (loading) return <div className="loading-page"><div className="spinner" /> Loading users…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Users</div>
          <div className="page-subtitle">Manage user roles</div>
        </div>
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

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
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={saving[u.id]}
                    onClick={() => handleSave(u.id)}
                  >
                    {saving[u.id] ? "Saving…" : "Save"}
                  </button>
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
