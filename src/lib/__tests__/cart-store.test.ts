import { lineUnitTotal, cartSubtotal, cartCount, groupByVendor } from '@/lib/cart-store';

const addon = (price: number) => ({ id: `a${price}`, name: 'x', name_th: null, price, allergens: [] });
const line = (unit_price: number, quantity: number, addons: ReturnType<typeof addon>[] = []) => ({
  line_id: 'l1',
  vendor_id: 'v1',
  menu_item_id: 'm1',
  name: 'Dish',
  name_th: null,
  unit_price,
  quantity,
  addons,
  allergens: [],
  note: '',
});

describe('lineUnitTotal', () => {
  it('is the bare price when there are no add-ons', () => {
    expect(lineUnitTotal(line(50, 1))).toBe(50);
  });

  it('adds every add-on price on top of the bare price', () => {
    expect(lineUnitTotal(line(50, 1, [addon(10), addon(5)]))).toBe(65);
  });
});

describe('cartSubtotal', () => {
  it('is zero for an empty cart', () => {
    expect(cartSubtotal({ items: [] })).toBe(0);
  });

  it('multiplies each line (price + add-ons) by its quantity', () => {
    const c = {
      items: [line(50, 2, [addon(10)]), line(30, 1)],
    };
    // (50+10)*2 + 30*1
    expect(cartSubtotal(c)).toBe(150);
  });
});

describe('cartCount', () => {
  it('sums quantities across lines', () => {
    const c = { items: [line(10, 3), line(10, 2)] };
    expect(cartCount(c)).toBe(5);
  });
});

describe('groupByVendor', () => {
  it('splits lines into one group per stall, in first-added order', () => {
    const a1 = { ...line(10, 1), vendor_id: 'vA' };
    const b1 = { ...line(20, 1), vendor_id: 'vB' };
    const a2 = { ...line(30, 1), vendor_id: 'vA' };
    expect(groupByVendor([a1, b1, a2])).toEqual([
      { vendor_id: 'vA', items: [a1, a2] },
      { vendor_id: 'vB', items: [b1] },
    ]);
  });
});
