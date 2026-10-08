-- Drop the hidden "Tom Yum Noodles with Fish Balls" (Nui Noodles), no longer on the menu.
-- order_items restricts the delete, so its past order lines go first (add-ons cascade);
-- ratings, ml_interactions and add-on groups cascade from menu_items.
delete from order_items oi
using menu_items m, vendors v
where oi.menu_item_id = m.id and m.vendor_id = v.id
  and v.name = 'Nui Noodles' and m.name = 'Tom Yum Noodles with Fish Balls';

delete from menu_items m
using vendors v
where m.vendor_id = v.id
  and v.name = 'Nui Noodles' and m.name = 'Tom Yum Noodles with Fish Balls';
