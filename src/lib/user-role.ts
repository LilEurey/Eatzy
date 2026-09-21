import { supabase } from '@/lib/supabase';

/** users.role for the given auth user, or null if missing / unreadable. */
export async function getUserRole(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
  if (error) console.warn('getUserRole failed:', error.message);
  return data?.role ?? null;
}
