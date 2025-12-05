import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Supabase configuration
// In production, these should come from environment variables
const SUPABASE_URL = 'https://tfnotszdttxrfeleltye.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmbm90c3pkdHR4cmZlbGVsdHllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MjY0MTEsImV4cCI6MjA4MDUwMjQxMX0.cRNAdShs6V0McpRJ0Sp0XOBTqj9cpAfQQ7z71IBnDUY';

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

// Generate a unique session ID for this browser session
const generateSessionId = (): string => {
  const stored = sessionStorage.getItem('lunch_session_id');
  if (stored) return stored;
  
  const newId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  sessionStorage.setItem('lunch_session_id', newId);
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
