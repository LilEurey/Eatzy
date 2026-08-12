-- Migration: free_test_claimed_stalls
-- Frees the two stalls claimed while manually verifying the
-- vendor_apply_own_password feature (Som Tam Station, Mama Noodle House),
-- so /vendor-apply has real available stalls again. The test auth accounts
-- are left in place (harmless, inert) — only ownership and role are reset,
-- using the same transaction-scoped trigger bypass
-- approve_vendor_application already uses for role changes.

do $$
begin
  perform set_config('app.bypass_role_guard', 'on', true);

  update public.users
     set role = 'student'
   where id in (
     select owner_user_id from public.vendors
      where id in ('e4ac8c58-5e24-4496-895e-d52cd553fc69', '83e535a5-2163-4ac8-831b-4cc6713b8fe7')
        and owner_user_id is not null
   );

  update public.vendors
     set owner_user_id = null
   where id in ('e4ac8c58-5e24-4496-895e-d52cd553fc69', '83e535a5-2163-4ac8-831b-4cc6713b8fe7');
end $$;
