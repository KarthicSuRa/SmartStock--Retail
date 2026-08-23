// /src/lib/supabase.ts

import { createClient } from '@supabase/supabase-js';

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  envUrl && 
  !envUrl.includes('placeholder') && 
  !envUrl.includes('mock') && 
  envUrl.startsWith('http')
);

// If unconfigured, use local dummy URL and explicitly disable realtime to prevent WebSocket net::ERR_NAME_NOT_RESOLVED
const supabaseUrl = isSupabaseConfigured ? envUrl! : 'http://127.0.0.1:54321';
const supabaseAnonKey = isSupabaseConfigured ? envKey! : 'dummy-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
