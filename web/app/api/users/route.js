import { createClient } from "@supabase/supabase-js";
import { requireAuth, MANAGER_ONLY } from "@/lib/auth";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;

  const { data, error } = await adminClient().auth.admin.listUsers();
  if (error) return Response.json({ error: "Failed to list users" }, { status: 500 });

  const users = data.users.map((u) => ({
    id:    u.id,
    email: u.email,
    role:  u.user_metadata?.role ?? "manager",
  }));

  return Response.json(users);
}

export async function POST(request) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;

  const { email, password, role } = await request.json();
  if (!email || !password) {
    return Response.json({ error: "Email and password are required" }, { status: 400 });
  }
  if (!["manager", "admin", "dispatcher"].includes(role)) {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }

  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    user_metadata: { role },
    email_confirm: true,
  });

  if (error) return Response.json({ error: "Failed to create user" }, { status: 500 });
  return Response.json({ id: data.user.id, email: data.user.email, role });
}
