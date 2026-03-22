import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

async function getCallerRole() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => { try { cookieStore.set(name, value, options); } catch {} }),
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user?.user_metadata?.role ?? "manager";
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function PUT(request, { params }) {
  const callerRole = await getCallerRole();
  if (callerRole !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { role } = await request.json();

  if (!["manager", "admin", "dispatcher"].includes(role)) {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }

  const { error } = await adminClient().auth.admin.updateUserById(id, {
    user_metadata: { role },
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ id, role });
}

export async function DELETE(request, { params }) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => { try { cookieStore.set(name, value, options); } catch {} }),
      },
    }
  );
  const { data: { user: caller } } = await supabase.auth.getUser();
  if ((caller?.user_metadata?.role ?? "manager") !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (caller.id === id) {
    return Response.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const { error } = await adminClient().auth.admin.deleteUser(id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ message: "User deleted" });
}
