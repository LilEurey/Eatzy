-- Migration: harden_handle_new_user
-- handle_new_user is SECURITY DEFINER and fires on every Google sign-in
-- (after insert on auth.users), running with the privileges of the function
-- owner. Without a pinned search_path, anything the caller can write to a
-- schema earlier in their search_path could shadow an unqualified reference
-- inside it (search_path hijacking) — the function body already schema-
-- qualifies every reference, but this closes the gap defensively.

alter function public.handle_new_user() set search_path = '';
