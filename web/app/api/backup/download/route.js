// Database backup is not applicable for PostgreSQL/Supabase hosted deployments.
// Backups are handled by Supabase's automated daily backups.
// This endpoint is kept for API compatibility but returns a 501.
export async function GET() {
  return Response.json(
    { error: "Automated DB backup is handled by Supabase. Download from your Supabase project dashboard." },
    { status: 501 }
  );
}
