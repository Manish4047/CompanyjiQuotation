import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminEnv } from "@/lib/env";

export function createAdminClient() {
  const env = getSupabaseAdminEnv();
  if (!env) {
    throw new Error("Supabase service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(env.url, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
