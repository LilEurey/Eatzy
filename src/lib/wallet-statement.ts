import { BANGKOK_TZ } from '@/lib/time';

// Bangkok is fixed UTC+7 with no DST, so a Bangkok calendar month is a plain
// UTC range shifted back 7h.
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

export type StatementMonth = { year: number; month: number }; // month 0-11

export function currentBangkokMonth(now: Date = new Date()): StatementMonth {
  const bkk = new Date(now.getTime() + BKK_OFFSET_MS);
  return { year: bkk.getUTCFullYear(), month: bkk.getUTCMonth() };
}

export function shiftMonth({ year, month }: StatementMonth, delta: number): StatementMonth {
  const d = new Date(Date.UTC(year, month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

// [start, end) as ISO instants, for .gte/.lt on created_at.
export function bangkokMonthRange({ year, month }: StatementMonth) {
  return {
    start: new Date(Date.UTC(year, month, 1) - BKK_OFFSET_MS).toISOString(),
    end: new Date(Date.UTC(year, month + 1, 1) - BKK_OFFSET_MS).toISOString(),
  };
}

export function formatStatementMonth({ year, month }: StatementMonth, locale: string) {
  return new Date(Date.UTC(year, month, 15)).toLocaleDateString(locale, { timeZone: BANGKOK_TZ, month: 'long', year: 'numeric' });
}

// Sign-based: ledger rows are positive for money in (topup, refund) and
// negative for money out (payment).
export function statementTotals(txns: { amount: number }[]) {
  let moneyIn = 0;
  let moneyOut = 0;
  for (const { amount } of txns) {
    if (amount > 0) moneyIn += amount;
    else moneyOut -= amount;
  }
  return { moneyIn, moneyOut, net: moneyIn - moneyOut };
}
