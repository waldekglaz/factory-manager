import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.test") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

/**
 * Runs once before all Playwright tests.
 * Ensures the test admin user has role="admin" in Supabase user_metadata.
 */
export default async function globalSetup() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error) throw new Error(`Global setup failed: ${error.message}`);

  const adminUser = users.find((u) => u.email === process.env.TEST_ADMIN_EMAIL);
  if (!adminUser) throw new Error(`Test admin user ${process.env.TEST_ADMIN_EMAIL} not found in Supabase`);

  await supabase.auth.admin.updateUserById(adminUser.id, {
    user_metadata: { role: "admin" },
  });

  const managerUser = users.find((u) => u.email === process.env.TEST_MANAGER_EMAIL);
  if (managerUser) {
    await supabase.auth.admin.updateUserById(managerUser.id, {
      user_metadata: { role: "manager" },
    });
  }

  console.log(`  ✔ Roles set: ${process.env.TEST_ADMIN_EMAIL}=admin, ${process.env.TEST_MANAGER_EMAIL}=manager`);
}
