import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Verifies the caller is authenticated and optionally checks their role.
 * Supports both cookie-based sessions (web app) and Bearer tokens (mobile app).
 *
 * @param {Request} request - The incoming Next.js request object
 * @param {string[]} [allowedRoles] - If provided, caller must have one of these roles
 * @returns {{ user, role } | { error: Response }}
 */
export async function requireAuth(request, allowedRoles) {
  let user = null;

  // 1. Try Bearer token (mobile app / API clients)
  const authHeader = request?.headers?.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data } = await supabase.auth.getUser(token);
    user = data?.user ?? null;
  }

  // 2. Fall back to cookie session (web app)
  if (!user) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cs) =>
            cs.forEach(({ name, value, options }) => {
              try { cookieStore.set(name, value, options); } catch {}
            }),
        },
      }
    );
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  }

  if (!user) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const role = user.user_metadata?.role ?? "manager";

  if (allowedRoles && !allowedRoles.includes(role)) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, role };
}

// Role constants
export const ALL_ROLES    = ["manager", "admin", "dispatcher"];
export const MANAGER_ONLY = ["manager"];
export const MANAGER_ADMIN = ["manager", "admin"];
export const MANAGER_DISPATCHER = ["manager", "dispatcher"];
