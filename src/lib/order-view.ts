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

// Queue ticket shown to students and vendors: vendor's initial + zero-padded
// daily number (A042), so it can't be mistaken for an "N orders ahead" count.
// Initial comes from the vendor name, not stall_number: admin-created and
// off-campus stalls have no stall_number, and notifications only snapshot the name.
export function queueTicket(n: number | null, vendorName: string | null | undefined): string {
  if (n == null) return '—';
  const letter = vendorName?.toUpperCase().match(/[A-Z]/)?.[0] ?? 'Q';
  return letter + String(n).padStart(3, '0');
}
