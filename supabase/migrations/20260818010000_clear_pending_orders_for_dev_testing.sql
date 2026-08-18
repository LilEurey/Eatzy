-- Migration: clear_pending_orders_for_dev_testing
-- Dev-testing aid: wipes seeded/leftover pending orders (and their
-- order_items + payments rows) so the student Orders tab and vendor
-- dashboard queue start empty for a fresh order-flow test run.
-- order_items cascades on order delete; payments is "on delete restrict",
-- so it must be deleted explicitly before the order row.

delete from public.payments
 where order_id in (select id from public.orders where status = 'pending');

delete from public.orders
 where status = 'pending';
