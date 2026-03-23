import { createClient } from "@supabase/supabase-js";
import { requireAuth, MANAGER_ONLY } from "@/lib/auth";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function PUT(request, { params }) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;

  const { id } = await params;
  const { role } = await request.json();

  if (!["manager", "admin", "dispatcher"].includes(role)) {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }

  const { error } = await adminClient().auth.admin.updateUserById(id, {
    user_metadata: { role },
  });

  if (error) return Response.json({ error: "Failed to update user" }, { status: 500 });
  return Response.json({ id, role });
}

export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;

  const { id } = await params;

  if (auth.user.id === id) {
    return Response.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const { error } = await adminClient().auth.admin.deleteUser(id);
  if (error) return Response.json({ error: "Failed to delete user" }, { status: 500 });
  return Response.json({ message: "User deleted" });
}
