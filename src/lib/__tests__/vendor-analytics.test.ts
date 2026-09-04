import {
  salesVelocity,
  busyGrid,
  itemSales,
  periodDelta,
  avgFulfilmentMinutes,
  type AnalyticsOrder,
  type SalesOrder,
} from '@/lib/vendor-analytics';
import { bangkokWeekday } from '@/lib/time';

// Bangkok is a fixed UTC+7, no DST. 2026-06-15 is a Monday; 2026-06-14 a Sunday.
const NOW = new Date('2026-06-15T05:00:00Z'); // 12:00 Bangkok, Mon

function order(created_at: string, total_amount: number, status: AnalyticsOrder['status'] = 'completed'): AnalyticsOrder {
  return { created_at, total_amount, status };
}

describe('salesVelocity — hourly (today / yesterday)', () => {
  const orders: AnalyticsOrder[] = [
    order('2026-06-15T04:00:00Z', 100), // 11:00 BKK today
    order('2026-06-15T04:30:00Z', 50), //  11:00 BKK today
    order('2026-06-15T05:00:00Z', 200, 'accepted'), // 12:00 BKK today (the "now" hour)
    order('2026-06-15T04:15:00Z', 999, 'rejected'), // excluded
    order('2026-06-15T04:20:00Z', 999, 'cancelled'), // excluded
    order('2026-06-14T04:00:00Z', 500), // 11:00 BKK yesterday
  ];

  it('emits one bar per hour across the open window with per-hour revenue sums', () => {
    const bars = salesVelocity(orders, 'today', 10, 14, NOW);
    expect(bars.map(b => b.label)).toEqual(['10AM', '11AM', '12PM', '1PM', '2PM']);
    expect(bars.map(b => b.value)).toEqual([0, 150, 200, 0, 0]);
  });

  it('flags the current hour as isNow only for the "today" range', () => {
    expect(salesVelocity(orders, 'today', 10, 14, NOW).find(b => b.isNow)?.label).toBe('12PM');
    expect(salesVelocity(orders, 'yesterday', 10, 14, NOW).some(b => b.isNow)).toBe(false);
  });

  it('buckets the previous Bangkok day for the "yesterday" range', () => {
    const bars = salesVelocity(orders, 'yesterday', 10, 14, NOW);
    expect(bars.find(b => b.label === '11AM')?.value).toBe(500);
    expect(bars.find(b => b.label === '12PM')?.value).toBe(0);
  });

  it('clamps a nonsense open window instead of producing an empty or reversed axis', () => {
    const bars = salesVelocity(orders, 'today', NaN, NaN, NOW);
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.every(b => typeof b.value === 'number' && !Number.isNaN(b.value))).toBe(true);
  });
});

describe('salesVelocity — daily (week / month)', () => {
  const orders: AnalyticsOrder[] = [
    order('2026-06-15T04:00:00Z', 100), // today
    order('2026-06-13T04:00:00Z', 40), // 2 days ago
    order('2026-06-13T09:00:00Z', 60), // same day, 16:00 BKK
    order('2026-06-01T04:00:00Z', 500), // >7 days ago
  ];

  it('emits one bar per day for the trailing week, labelled by day-of-month', () => {
    const bars = salesVelocity(orders, 'week', 9, 20, NOW);
    expect(bars).toHaveLength(7);
    expect(bars.map(b => b.label)).toEqual(['9', '10', '11', '12', '13', '14', '15']);
    expect(bars.find(b => b.label === '13')?.value).toBe(100);
    expect(bars.find(b => b.label === '15')?.value).toBe(100);
    expect(bars.find(b => b.label === '9')?.value).toBe(0);
  });

  it('flags today as isNow and covers 30 days for the month range', () => {
    const bars = salesVelocity(orders, 'month', 9, 20, NOW);
    expect(bars).toHaveLength(30);
    expect(bars.filter(b => b.isNow)).toHaveLength(1);
    expect(bars[bars.length - 1].isNow).toBe(true);
  });
});

describe('busyGrid — weekday × meal-segment order density', () => {
  const orders: AnalyticsOrder[] = [
    order('2026-06-15T02:00:00Z', 1), // Mon 09:00 BKK — breakfast
    order('2026-06-15T04:00:00Z', 1), // Mon 11:00 BKK — lunch
    order('2026-06-15T04:30:00Z', 1), // Mon 11:30 BKK — lunch
    order('2026-06-14T11:00:00Z', 1), // Sun 18:00 BKK — dinner
    order('2026-06-15T04:15:00Z', 1, 'rejected'), // excluded
    order('2026-05-01T04:00:00Z', 1), // >4 weeks before NOW — excluded
  ];
  const mon = bangkokWeekday(new Date('2026-06-15T05:00:00Z'));
  const sun = bangkokWeekday(new Date('2026-06-14T05:00:00Z'));

  it('counts orders into [weekday][breakfast|lunch|dinner] within the window', () => {
    const { rows, max } = busyGrid(orders, 4, NOW);
    expect(rows).toHaveLength(7);
    expect(rows.every(r => r.length === 3)).toBe(true);
    expect(rows[mon]).toEqual([1, 2, 0]);
    expect(rows[sun][2]).toBe(1);
    expect(max).toBe(2);
  });

  it('is all-zero with max 0 for no orders', () => {
    const { rows, max } = busyGrid([], 4, NOW);
    expect(max).toBe(0);
    expect(rows.flat().every(c => c === 0)).toBe(true);
  });
});

// ─── itemSales — per-item best sellers ──────────────────────────────────────

function salesOrder(
  created_at: string,
  items: SalesOrder['items'],
  status: SalesOrder['status'] = 'completed',
): SalesOrder {
  return { created_at, status, items };
}
const li = (menu_item_id: string, quantity: number, unit_price: number, name = menu_item_id) => ({
  menu_item_id,
  name,
  name_th: null,
  quantity,
  unit_price,
});

describe('itemSales', () => {
  it('accumulates units, revenue and distinct order counts per item, best seller first', () => {
    const orders: SalesOrder[] = [
      salesOrder('2026-06-15T04:00:00Z', [li('pad-thai', 2, 60), li('tea', 1, 25)]),
      salesOrder('2026-06-15T05:00:00Z', [li('pad-thai', 1, 60)]),
      salesOrder('2026-06-15T06:00:00Z', [li('tea', 3, 25)]),
    ];
    const sales = itemSales(orders, 'today', NOW);
    expect(sales.map(s => s.menuItemId)).toEqual(['tea', 'pad-thai']); // 4 units vs 3
    const tea = sales.find(s => s.menuItemId === 'tea')!;
    expect(tea).toMatchObject({ units: 4, revenue: 100, orderCount: 2 });
    const padThai = sales.find(s => s.menuItemId === 'pad-thai')!;
    expect(padThai).toMatchObject({ units: 3, revenue: 180, orderCount: 2 });
  });

  it('breaks unit ties on revenue', () => {
    const orders: SalesOrder[] = [
      salesOrder('2026-06-15T04:00:00Z', [li('cheap', 2, 20), li('pricey', 2, 90)]),
    ];
    expect(itemSales(orders, 'today', NOW).map(s => s.menuItemId)).toEqual(['pricey', 'cheap']);
  });

  it('excludes rejected / cancelled orders', () => {
    const orders: SalesOrder[] = [
      salesOrder('2026-06-15T04:00:00Z', [li('x', 5, 10)], 'rejected'),
      salesOrder('2026-06-15T04:30:00Z', [li('x', 5, 10)], 'cancelled'),
      salesOrder('2026-06-15T05:00:00Z', [li('x', 1, 10)]),
    ];
    expect(itemSales(orders, 'today', NOW)).toEqual([
      { menuItemId: 'x', name: 'x', nameTh: null, units: 1, revenue: 10, orderCount: 1 },
    ]);
  });

  it('windows by range — week keeps 3-day-old rows, today drops them', () => {
    const orders: SalesOrder[] = [
      salesOrder('2026-06-15T04:00:00Z', [li('today-item', 1, 10)]),
      salesOrder('2026-06-12T04:00:00Z', [li('old-item', 9, 10)]),
    ];
    expect(itemSales(orders, 'today', NOW).map(s => s.menuItemId)).toEqual(['today-item']);
    expect(itemSales(orders, 'week', NOW).map(s => s.menuItemId).sort()).toEqual(['old-item', 'today-item']);
  });

  it('returns [] for no orders', () => {
    expect(itemSales([], 'month', NOW)).toEqual([]);
  });
});

// ─── periodDelta — window-over-window change ────────────────────────────────

describe('periodDelta', () => {
  const orders: AnalyticsOrder[] = [
    order('2026-06-15T04:00:00Z', 300), // today
    order('2026-06-15T05:00:00Z', 100), // today
    order('2026-06-14T04:00:00Z', 200), // yesterday
    order('2026-06-14T04:15:00Z', 999, 'rejected'), // excluded
  ];

  it('reports an up delta for orders today vs yesterday', () => {
    expect(periodDelta(orders, 'today', 'orders', NOW)).toEqual({ pct: 100, direction: 'up' }); // 2 vs 1
  });

  it('reports a down delta for revenue when the current window is smaller', () => {
    const rev: AnalyticsOrder[] = [order('2026-06-15T04:00:00Z', 50), order('2026-06-14T04:00:00Z', 200)];
    expect(periodDelta(rev, 'today', 'revenue', NOW)).toEqual({ pct: 75, direction: 'down' });
  });

  it('reports flat when the metric is unchanged', () => {
    const flat: AnalyticsOrder[] = [order('2026-06-15T04:00:00Z', 100), order('2026-06-14T04:00:00Z', 100)];
    expect(periodDelta(flat, 'today', 'revenue', NOW)).toEqual({ pct: 0, direction: 'flat' });
  });

  it('returns null when the baseline window has nothing', () => {
    const noBaseline: AnalyticsOrder[] = [order('2026-06-15T04:00:00Z', 100)];
    expect(periodDelta(noBaseline, 'today', 'orders', NOW)).toBeNull();
  });

  it('returns null for the all-time range', () => {
    expect(periodDelta(orders, 'all', 'orders', NOW)).toBeNull();
  });
});

// ─── avgFulfilmentMinutes ──────────────────────────────────────────────────

describe('avgFulfilmentMinutes', () => {
  const mk = (created_at: string, handedOff: string | null, status: AnalyticsOrder['status'] = 'completed') => ({
    created_at,
    status,
    vendor_handed_off_at: handedOff,
  });

  it('averages placed → handed-off minutes over fulfilled orders in range', () => {
    const orders = [
      mk('2026-06-15T04:00:00Z', '2026-06-15T04:10:00Z'), // 10 min
      mk('2026-06-15T05:00:00Z', '2026-06-15T05:20:00Z'), // 20 min
    ];
    expect(avgFulfilmentMinutes(orders, 'today', NOW)).toBe(15);
  });

  it('ignores orders that never reached hand-off and cancelled ones', () => {
    const orders = [
      mk('2026-06-15T04:00:00Z', null),
      mk('2026-06-15T05:00:00Z', '2026-06-15T05:30:00Z', 'cancelled'),
      mk('2026-06-15T06:00:00Z', '2026-06-15T06:12:00Z'),
    ];
    expect(avgFulfilmentMinutes(orders, 'today', NOW)).toBe(12);
  });

  it('returns null when nothing is measurable', () => {
    expect(avgFulfilmentMinutes([mk('2026-06-15T04:00:00Z', null)], 'today', NOW)).toBeNull();
  });
});
