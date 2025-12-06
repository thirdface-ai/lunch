import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Supabase configuration from environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
}

// Create Supabase client with proper types
export const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL, 
  SUPABASE_ANON_KEY, 
  {
    auth: {
      persistSession: false, // We're using session IDs, not auth
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'x-application-name': 'lunch-decider',
      },
    },
  }
);

// Generate a unique session ID that persists across browser sessions
// Uses localStorage so variety tracking works even after closing browser
const generateSessionId = (): string => {
  const stored = localStorage.getItem('lunch_session_id');
  if (stored) return stored;
  
  const newId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  localStorage.setItem('lunch_session_id', newId);
  return newId;
};

// Export session ID getter
export const getSessionId = (): string => {
  if (typeof window === 'undefined') {
    return 'server-side';
  }
  return generateSessionId();
};

// Re-export types for convenience
export type { Database };

export default supabase;
