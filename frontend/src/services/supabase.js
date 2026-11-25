import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabasePublishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
).trim();

/**
 * True when both public frontend Supabase environment variables are set.
 */
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey
);

/**
 * Browser-safe Supabase client using only the public URL and publishable key.
 * Remains null until VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are configured.
 */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;

/**
 * Returns the initialized frontend Supabase client or throws a clear setup error.
 */
export function getSupabaseClient() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in frontend/.env.'
    );
  }

  return supabase;
}
