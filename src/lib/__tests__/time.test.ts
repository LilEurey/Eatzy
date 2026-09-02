import {
  getMealSegment,
  nextPickupSlots,
  isBangkokDateInRange,
  isBangkokToday,
} from '@/lib/time';

// A fixed instant: 2026-06-15T04:00:00Z == 11:00 in Bangkok (UTC+7, no DST).
const NOON_ISH_BKK = new Date('2026-06-15T04:00:00Z');

describe('getMealSegment (Bangkok hour buckets)', () => {
  it('is breakfast before 11:00 Bangkok', () => {
    expect(getMealSegment(new Date('2026-06-15T03:59:00Z'))).toBe('breakfast');
  });

  it('is lunch from 11:00 up to 17:00 Bangkok', () => {
    expect(getMealSegment(NOON_ISH_BKK)).toBe('lunch');
    expect(getMealSegment(new Date('2026-06-15T09:59:00Z'))).toBe('lunch'); // 16:59 BKK
  });

  it('is dinner from 17:00 Bangkok onward', () => {
    expect(getMealSegment(new Date('2026-06-15T10:00:00Z'))).toBe('dinner'); // 17:00 BKK
  });
});

describe('nextPickupSlots', () => {
  const FIXED_NOW = new Date('2026-06-15T04:03:10Z').getTime();
  beforeAll(() => jest.useFakeTimers().setSystemTime(FIXED_NOW));
  afterAll(() => jest.useRealTimers());

  it('returns the requested number of slots', () => {
    expect(nextPickupSlots(5)).toHaveLength(5);
    expect(nextPickupSlots(3)).toHaveLength(3);
  });

  it('rounds the first slot up to the next 5-minute mark after the lead time', () => {
    const [first] = nextPickupSlots(1, 15, 15);
    // now 04:03:10 + 15m lead = 04:18:10 -> ceil to 04:20:00Z
    expect(first.start.toISOString()).toBe('2026-06-15T04:20:00.000Z');
  });

  it('spaces slots by slotMinutes and makes each window slotMinutes long', () => {
    const slots = nextPickupSlots(3, 15, 15);
    expect(slots[1].start.getTime() - slots[0].start.getTime()).toBe(15 * 60 * 1000);
    expect(slots[0].end.getTime() - slots[0].start.getTime()).toBe(15 * 60 * 1000);
  });
});

describe('Bangkok calendar-day helpers', () => {
  it('isBangkokToday is true for "now"', () => {
    expect(isBangkokToday(new Date().toISOString())).toBe(true);
  });

  it('isBangkokDateInRange("all") always matches', () => {
    expect(isBangkokDateInRange('2000-01-01T00:00:00Z', 'all')).toBe(true);
  });

  it('isBangkokDateInRange("week") excludes an instant older than 7 days', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(isBangkokDateInRange(tenDaysAgo, 'week')).toBe(false);
  });

  it('isBangkokDateInRange("month") includes an instant 10 days old', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(isBangkokDateInRange(tenDaysAgo, 'month')).toBe(true);
  });
});
