import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

if (!supabaseUrl || (!supabaseAnonKey && !supabaseServiceRoleKey)) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[Supabase] Warning: NEXT_PUBLIC_SUPABASE_URL or Supabase API keys (SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY) are not defined. Using placeholder client for local/build environment.'
    );
  }
}

export const isSupabaseConfigured = (): boolean => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return Boolean(
    url &&
    key &&
    url !== 'https://placeholder.supabase.co' &&
    key !== 'placeholder-anon-key' &&
    url !== 'your-supabase-url-here' &&
    key !== 'your-supabase-anon-key-here' &&
    key !== 'your-service-role-key-here'
  );
};

// Fallback to placeholder values so module evaluation / next build static generation does not crash
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || supabaseServiceRoleKey || 'placeholder-anon-key'
);

/**
 * Server-side client utilizing SUPABASE_SERVICE_ROLE_KEY with fallback to NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * Bypasses RLS on server actions for authoritative user registration and management.
 */
let cachedServerClient: SupabaseClient | null = null;
let cachedServerUrl = '';
let cachedServerKey = '';

export const getSupabaseServerClient = (): SupabaseClient => {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    'https://placeholder.supabase.co';

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'placeholder-anon-key';

  if (cachedServerClient && cachedServerKey === key && cachedServerUrl === url) {
    return cachedServerClient;
  }

  cachedServerUrl = url;
  cachedServerKey = key;
  cachedServerClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedServerClient;
};

export const supabaseAdmin = getSupabaseServerClient();

