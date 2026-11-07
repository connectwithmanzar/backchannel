import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as serviceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * DELETE /api/delete-account
 *
 * Permanently deletes the authenticated user's account and all associated
 * personal data. All personal tables reference auth.users with ON DELETE CASCADE,
 * so a single auth.admin.deleteUser() call removes everything.
 *
 * The service-role key is required because only a Supabase admin can delete
 * an auth user; the anon/session key cannot.
 */
export async function DELETE() {
  const uc = await createClient();
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = serviceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Explicitly delete CV from storage before the user row is removed
  // (storage objects don't cascade-delete with the auth user by default)
  const { data: cvFiles } = await svc.storage
    .from("cvs")
    .list(user.id);

  if (cvFiles?.length) {
    const paths = cvFiles.map((f) => `${user.id}/${f.name}`);
    await svc.storage.from("cvs").remove(paths);
  }

  // Delete the auth user — cascades to all personal tables via FK
  const { error } = await svc.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[delete-account] deleteUser failed:", error.message);
    return NextResponse.json({ error: "Failed to delete account: " + error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Account and all personal data deleted." });
}
