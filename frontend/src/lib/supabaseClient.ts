import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fqnrixjostcsosolsxhe.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_OirPkvPc46p0LF_g13sUXA_UNF9aQtu';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
