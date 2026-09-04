import { salesVelocity, busyGrid, type AnalyticsOrder } from '@/lib/vendor-analytics';
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
