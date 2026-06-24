/**
 * Service-role Supabase client — server-side ONLY, never import from client components.
 *
 * Use for actions that must bypass RLS or hit the Supabase Auth admin API
 * (e.g. creating auth.users records for passwordless members/merchants).
 * Regular table reads/writes should keep using `createServerSupabaseClient`
 * from '@/lib/supabase-server'.
 */
import { createClient } from '@supabase/supabase-js'

export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
