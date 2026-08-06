// Eatzy operates on a single KMUTT campus, so every clock the app shows
// should read as Thailand local time regardless of the device's own
// timezone — a tester (or a student traveling) in another timezone must
// still see pickup windows and order timestamps in Bangkok time.

export const BANGKOK_TZ = 'Asia/Bangkok';

function bangkokHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: BANGKOK_TZ, hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  return Number(parts.find(p => p.type === 'hour')!.value);
}

export function formatBangkokClock(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: BANGKOK_TZ, hour: '2-digit', minute: '2-digit' });
}

export function formatBangkokDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: BANGKOK_TZ, day: 'numeric', month: 'short' });
}

// Compares calendar dates in Thailand time, not the device's own local
// calendar day (which can differ from Bangkok's near midnight).
export function isBangkokToday(iso: string) {
  const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: BANGKOK_TZ }); // en-CA -> YYYY-MM-DD
  return dayKey(new Date(iso)) === dayKey(new Date());
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
