import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig, isSupabaseConfigured } from './env.js';

let cachedClient = null;
let cachedConfigKey = '';

export { getSupabaseConfig, isSupabaseConfigured };

/**
 * Returns a singleton Supabase client for backend server operations.
 * Session persistence is disabled because the Express API is stateless.
 */
export function getSupabaseClient() {
  const { url, secretKey } = getSupabaseConfig();

  if (!url || !secretKey) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in the root .env file.'
    );
  }

  const configKey = `${url}|${secretKey.length}`;
  if (cachedClient && cachedConfigKey === configKey) {
    return cachedClient;
  }

  cachedClient = createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  cachedConfigKey = configKey;

  return cachedClient;
}

/**
 * Creates a fresh, uncached Supabase client for user password sign-in
 * so the singleton service_role client never has its auth header overwritten.
 */
export function createAuthSupabaseClient() {
  const { url, secretKey } = getSupabaseConfig();
  if (!url || !secretKey) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in the root .env file.'
    );
  }
  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
