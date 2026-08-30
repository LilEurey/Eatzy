// Eatzy operates on a single KMUTT campus, so every clock the app shows
// should read as Thailand local time regardless of the device's own
// timezone — a tester (or a student traveling) in another timezone must
// still see pickup windows and order timestamps in Bangkok time.

export const BANGKOK_TZ = 'Asia/Bangkok';

function bangkokHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: BANGKOK_TZ, hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  return Number(parts.find(p => p.type === 'hour')!.value);
}

export type MealSegment = 'breakfast' | 'lunch' | 'dinner';

// Matches menu_items.available_time_segment's breakfast/lunch/dinner buckets
// (items tagged 'all' are always eligible regardless of this).
export function getMealSegment(date: Date = new Date()): MealSegment {
  const hour = bangkokHour(date);
  if (hour < 11) return 'breakfast';
  if (hour < 17) return 'lunch';
  return 'dinner';
}

export function formatBangkokClock(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: BANGKOK_TZ, hour: '2-digit', minute: '2-digit' });
}

export function formatBangkokDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: BANGKOK_TZ, day: 'numeric', month: 'short' });
}

export function formatBangkokClock12(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: BANGKOK_TZ, hour: 'numeric', minute: '2-digit', hour12: true });
}

// "Today, 3:45 PM" or "12 Aug, 3:45 PM" — shared by every screen that lists
// timestamped rows (vendor orders, vendor finance) with a friendly date.
export function formatFriendlyDateTime(iso: string | null, todayLabel: string) {
  if (!iso) return '';
  const time = formatBangkokClock12(iso);
  return isBangkokToday(iso) ? `${todayLabel}, ${time}` : `${formatBangkokDate(iso)}, ${time}`;
}

// en-CA formats as YYYY-MM-DD, giving a string that sorts/compares like a date.
function bangkokDayKey(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: BANGKOK_TZ });
}

// Compares calendar dates in Thailand time, not the device's own local
// calendar day (which can differ from Bangkok's near midnight).
export function isBangkokToday(iso: string) {
  return bangkokDayKey(new Date(iso)) === bangkokDayKey(new Date());
}

export type DateRangeFilter = 'today' | 'yesterday' | 'week' | 'month' | 'all';

// Rolling windows measured in Bangkok calendar days, not raw 24h buckets,
// so "yesterday" means Thailand's previous calendar day regardless of the
// device's own timezone.
export function isBangkokDateInRange(iso: string, range: DateRangeFilter) {
  if (range === 'all') return true;
  const target = new Date(iso);
  const now = new Date();
  if (range === 'today') return bangkokDayKey(target) === bangkokDayKey(now);
  if (range === 'yesterday') {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return bangkokDayKey(target) === bangkokDayKey(yesterday);
  }
  const days = range === 'week' ? 7 : 30;
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return target.getTime() >= cutoff && target.getTime() <= now.getTime();
}

type PickupSlot = { start: Date; end: Date; label: string };

// Absolute instants are timezone-agnostic — Thailand is a fixed UTC+7 with
// no DST, so "round up to the next 5 minutes from now" lands on the same
// real moment no matter what timezone the device itself is set to. Only
// the *label* needs to be explicitly formatted in Bangkok time.
export function nextPickupSlots(count = 5, leadMinutes = 15, slotMinutes = 15): PickupSlot[] {
  const FIVE_MIN = 5 * 60 * 1000;
  const firstStart = Math.ceil((Date.now() + leadMinutes * 60 * 1000) / FIVE_MIN) * FIVE_MIN;
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(firstStart + i * slotMinutes * 60 * 1000);
    const end = new Date(start.getTime() + slotMinutes * 60 * 1000);
    return { start, end, label: `${formatBangkokClock(start.toISOString())} – ${formatBangkokClock(end.toISOString())}` };
  });
}

export function timeSegmentForBangkok(date: Date): 'breakfast' | 'lunch' | 'dinner' {
  const hour = bangkokHour(date);
  if (hour < 11) return 'breakfast';
  if (hour < 17) return 'lunch';
  return 'dinner';
}
