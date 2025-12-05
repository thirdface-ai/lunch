import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tfnotszdttxrfeleltye.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmbm90c3pkdHR4cmZlbGVsdHllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MjY0MTEsImV4cCI6MjA4MDUwMjQxMX0.cRNAdShs6V0McpRJ0Sp0XOBTqj9cpAfQQ7z71IBnDUY';

export const supabase = createClient(supabaseUrl, supabaseKey);