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

// Bangkok-calendar window predicate with an injectable `now` (so callers stay
// unit-testable). Mirrors lib/time's isBangkokDateInRange, which hard-codes
// new Date() and so can't be used from tests.
function inRange(iso: string, range: DateRangeFilter, now: Date): boolean {
  if (range === 'all') return true;
  const t = new Date(iso);
  if (range === 'today') return bangkokDayKey(t) === bangkokDayKey(now);
  if (range === 'yesterday') return bangkokDayKey(t) === bangkokDayKey(new Date(now.getTime() - DAY_MS));
  const days = range === 'week' ? 7 : 30;
  const cutoff = now.getTime() - days * DAY_MS;
  return t.getTime() >= cutoff && t.getTime() <= now.getTime();
}

export type SalesOrderItem = {
  menu_item_id: string;
  name: string;
  name_th: string | null;
  quantity: number;
  unit_price: number;
};
export type SalesOrder = { created_at: string; status: OrderStatus; items: SalesOrderItem[] };

export type ItemSales = {
  menuItemId: string;
  name: string;
  nameTh: string | null;
  units: number; // sum of quantity
  revenue: number; // sum of quantity * unit_price
  orderCount: number; // distinct orders containing the item
};

// Per-menu-item sales over a date range, best seller first (units desc,
// revenue as tie-break). Rejected / cancelled orders are ignored — they never
// earned money and don't reflect real demand.
export function itemSales(orders: SalesOrder[], range: DateRangeFilter, now: Date = new Date()): ItemSales[] {
  const acc = new Map<string, ItemSales>();
  for (const o of orders) {
    if (EXCLUDED.has(o.status)) continue;
    if (!inRange(o.created_at, range, now)) continue;
    const counted = new Set<string>();
    for (const it of o.items) {
      let row = acc.get(it.menu_item_id);
      if (!row) {
        row = { menuItemId: it.menu_item_id, name: it.name, nameTh: it.name_th, units: 0, revenue: 0, orderCount: 0 };
        acc.set(it.menu_item_id, row);
      }
      row.units += it.quantity;
      row.revenue += it.quantity * it.unit_price;
      if (!counted.has(it.menu_item_id)) {
        row.orderCount += 1;
        counted.add(it.menu_item_id);
      }
      if (!row.name && it.name) row.name = it.name;
      if (!row.nameTh && it.name_th) row.nameTh = it.name_th;
    }
  }
  return [...acc.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue);
}

export type PeriodDelta = { pct: number; direction: 'up' | 'down' | 'flat' } | null;

// Percent change of a metric between the current window and the immediately
// preceding window of equal length (today vs yesterday, week vs prior 7 days,
// …). null when the baseline is zero (a % change is undefined) or range='all'.
export function periodDelta(
  orders: AnalyticsOrder[],
  range: DateRangeFilter,
  metric: 'orders' | 'revenue',
  now: Date = new Date(),
): PeriodDelta {
  if (range === 'all') return null;
  const rows = fulfilled(orders);

  let curr: AnalyticsOrder[];
  let prev: AnalyticsOrder[];
  if (range === 'today' || range === 'yesterday') {
    const currDay = bangkokDayKey(range === 'today' ? now : new Date(now.getTime() - DAY_MS));
    const prevDay = bangkokDayKey(new Date((range === 'today' ? now.getTime() : now.getTime() - DAY_MS) - DAY_MS));
    curr = rows.filter(o => bangkokDayKey(new Date(o.created_at)) === currDay);
    prev = rows.filter(o => bangkokDayKey(new Date(o.created_at)) === prevDay);
  } else {
    const days = range === 'week' ? 7 : 30;
    const currLo = now.getTime() - days * DAY_MS;
    const prevLo = now.getTime() - 2 * days * DAY_MS;
    curr = rows.filter(o => {
      const x = new Date(o.created_at).getTime();
      return x >= currLo && x <= now.getTime();
    });
    prev = rows.filter(o => {
      const x = new Date(o.created_at).getTime();
      return x >= prevLo && x < currLo;
    });
  }

  const measure = (arr: AnalyticsOrder[]) =>
    metric === 'orders' ? arr.length : arr.reduce((s, o) => s + o.total_amount, 0);
  const base = measure(prev);
  if (base === 0) return null;
  const raw = ((measure(curr) - base) / base) * 100;
  const pct = Math.round(Math.abs(raw));
  return { pct, direction: pct === 0 ? 'flat' : raw > 0 ? 'up' : 'down' };
}

export type FulfilmentOrder = { created_at: string; status: OrderStatus; vendor_handed_off_at: string | null };

// Mean minutes from order placed → vendor handed off, over fulfilled orders in
// range that actually reached hand-off. null when there's nothing to measure
// (caller falls back to the stall's static estimated_wait_min). This is an
// interim proxy — true prep time (accepted → ready) needs timestamp columns
// the schema doesn't have yet.
export function avgFulfilmentMinutes(orders: FulfilmentOrder[], range: DateRangeFilter, now: Date = new Date()): number | null {
  const durations: number[] = [];
  for (const o of orders) {
    if (EXCLUDED.has(o.status) || !o.vendor_handed_off_at) continue;
    if (!inRange(o.created_at, range, now)) continue;
    const ms = new Date(o.vendor_handed_off_at).getTime() - new Date(o.created_at).getTime();
    if (ms > 0) durations.push(ms / 60000);
  }
  if (!durations.length) return null;
  return Math.round(durations.reduce((s, d) => s + d, 0) / durations.length);
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
