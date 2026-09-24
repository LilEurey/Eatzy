import { supabase } from '@/lib/supabase';

/** users.role for the given auth user. `error` distinguishes "couldn't read
 * it" from "no role" — routing must not treat a network blip as a student. */
export async function loadUserRole(userId: string): Promise<{ role: string | null; error: boolean }> {
  const { data, error } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
  if (error) console.warn('getUserRole failed:', error.message);
  return { role: data?.role ?? null, error: !!error };
}

/** users.role for the given auth user, or null if missing / unreadable. */
export async function getUserRole(userId: string): Promise<string | null> {
  return (await loadUserRole(userId)).role;
}
