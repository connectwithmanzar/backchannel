import { createClient } from "@supabase/supabase-js";

/** Server-only client with the service role key (bypasses row-level security). Never import in client code. */
export function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
