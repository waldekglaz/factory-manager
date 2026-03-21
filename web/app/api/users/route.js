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

export async function GET() {
  const callerRole = await getCallerRole();
  if (callerRole !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await adminClient().auth.admin.listUsers();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const users = data.users.map((u) => ({
    id:    u.id,
    email: u.email,
    role:  u.user_metadata?.role ?? "manager",
  }));

  return Response.json(users);
}
