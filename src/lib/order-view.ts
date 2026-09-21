// Shared shape for the order_items embed used by track / rate / orders:
//   order_items(quantity,unit_price,menu_items(name,name_th),order_item_addons(name,name_th,price))
type OrderItemRow = {
  menu_item_id?: string;
  quantity: number;
  unit_price: number;
  menu_items: { name: string; name_th: string | null } | null;
  order_item_addons: { name: string; name_th: string | null; price: number }[] | null;
};

export function mapOrderItems(rows: OrderItemRow[] | null) {
  return (rows ?? []).map(oi => ({
    name: oi.menu_items?.name ?? '',
    name_th: oi.menu_items?.name_th ?? null,
    quantity: oi.quantity,
    unit_price: oi.unit_price,
    addons: (oi.order_item_addons ?? []).map(a => ({ name: a.name, name_th: a.name_th ?? null, price: a.price })),
  }));
}
