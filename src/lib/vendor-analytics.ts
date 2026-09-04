// Pure, React-Native-free aggregations for the vendor dashboard overview
// widgets (Sales Velocity bars + Busy Times heatmap). Kept separate from the
// screen so the bucketing math stays unit-testable — see
// __tests__/vendor-analytics.test.ts. Works off the order rows already in
// vendor-store (whole history, all statuses); does its own date windowing.

import type { OrderStatus } from '@/lib/vendor-store';
import { bangkokDayKey, bangkokHour, bangkokWeekday, getMealSegment, type DateRangeFilter } from '@/lib/time';

export type AnalyticsOrder = { created_at: string; status: OrderStatus; total_amount: number };

export type VelocityBar = { label: string; value: number; isNow: boolean };

const DAY_MS = 24 * 60 * 60 * 1000;
// Rejected / cancelled orders never earned money and don't reflect real demand.
const EXCLUDED: ReadonlySet<OrderStatus> = new Set<OrderStatus>(['rejected', 'cancelled']);
const SEGMENT_INDEX = { breakfast: 0, lunch: 1, dinner: 2 } as const;

function fulfilled(orders: AnalyticsOrder[]): AnalyticsOrder[] {
  return orders.filter(o => !EXCLUDED.has(o.status));
}

// 0 → "12AM", 9 → "9AM", 12 → "12PM", 23 → "11PM".
function hourLabel(hour: number): string {
  const h12 = ((hour + 11) % 12) + 1;
  return `${h12}${hour < 12 ? 'AM' : 'PM'}`;
}

function clampHour(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(23, Math.max(0, Math.trunc(value)));
}

// Revenue (฿) per time bucket. today/yesterday → one bar per hour across the
// vendor's open window; week/month → one bar per Bangkok calendar day.
export function salesVelocity(
  orders: AnalyticsOrder[],
  range: DateRangeFilter,
  openHour: number,
  closeHour: number,
  now: Date = new Date(),
): VelocityBar[] {
  const rows = fulfilled(orders);

  if (range === 'today' || range === 'yesterday') {
    const targetDay = bangkokDayKey(range === 'today' ? now : new Date(now.getTime() - DAY_MS));
    const lo = clampHour(openHour, 9);
    const hi = Math.max(lo, clampHour(closeHour, 20));
    const nowHour = bangkokHour(now);

    const totals = new Map<number, number>();
    for (const o of rows) {
      const d = new Date(o.created_at);
      if (bangkokDayKey(d) !== targetDay) continue;
      const h = bangkokHour(d);
      if (h < lo || h > hi) continue;
      totals.set(h, (totals.get(h) ?? 0) + o.total_amount);
    }

    const bars: VelocityBar[] = [];
    for (let h = lo; h <= hi; h++) {
      bars.push({ label: hourLabel(h), value: totals.get(h) ?? 0, isNow: range === 'today' && h === nowHour });
    }
    return bars;
  }

  const days = range === 'week' ? 7 : 30;
  const todayKey = bangkokDayKey(now);
  const totals = new Map<string, number>();
  for (const o of rows) {
    totals.set(bangkokDayKey(new Date(o.created_at)), (totals.get(bangkokDayKey(new Date(o.created_at))) ?? 0) + o.total_amount);
  }

  const bars: VelocityBar[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = bangkokDayKey(new Date(now.getTime() - i * DAY_MS));
    bars.push({
      label: String(Number(key.slice(8, 10))), // day-of-month, no leading zero
      value: totals.get(key) ?? 0,
      isNow: key === todayKey,
    });
  }
  return bars;
}

export type BusyGrid = { rows: number[][]; max: number };

// Order counts over the trailing `weeks`, indexed [weekday 0=Mon..6=Sun]
// [meal segment 0=breakfast,1=lunch,2=dinner]. `max` is the busiest cell,
// for normalising the heatmap tint (guard max === 0 at the call site).
export function busyGrid(orders: AnalyticsOrder[], weeks = 4, now: Date = new Date()): BusyGrid {
  const cutoff = now.getTime() - weeks * 7 * DAY_MS;
  const rows: number[][] = Array.from({ length: 7 }, () => [0, 0, 0]);

  for (const o of fulfilled(orders)) {
    const d = new Date(o.created_at);
    if (d.getTime() < cutoff) continue;
    rows[bangkokWeekday(d)][SEGMENT_INDEX[getMealSegment(d)]]++;
  }

  return { rows, max: Math.max(0, ...rows.flat()) };
}
