import { createClient } from "@supabase/supabase-js";
import { DB_SCHEMA } from "@/lib/supabase/schema";

/** Server-only client with the service role key (bypasses row-level security). Never import in client code. */
export function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    db: { schema: DB_SCHEMA },
  });
}
