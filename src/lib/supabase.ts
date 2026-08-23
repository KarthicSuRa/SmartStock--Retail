// /src/lib/supabase.ts

import { createClient } from '@supabase/supabase-js';

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const DEFAULT_SUPABASE_URL = 'https://fqnrixjostcsosolsxhe.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_OirPkvPc46p0LF_g13sUXA_UNF9aQtu';

const supabaseUrl = envUrl && envUrl.startsWith('http') ? envUrl : DEFAULT_SUPABASE_URL;
const supabaseAnonKey = envKey && envKey.length > 0 ? envKey : DEFAULT_SUPABASE_KEY;

export const isSupabaseConfigured = true;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
