-- Drop the hidden "Tom Yum Noodles with Fish Balls" (Nui Noodles), no longer on the menu.
-- If past orders reference it, keep the row hidden instead: deleting order lines would
-- rewrite receipts and (via order_items_recompute_order_totals) drift total_amount from payments.amount.
update menu_items m set is_available = false
from vendors v
where m.vendor_id = v.id
  and v.name = 'Nui Noodles' and m.name = 'Tom Yum Noodles with Fish Balls';

delete from menu_items m
using vendors v
where m.vendor_id = v.id
  and v.name = 'Nui Noodles' and m.name = 'Tom Yum Noodles with Fish Balls'
  and not exists (select 1 from order_items oi where oi.menu_item_id = m.id);
