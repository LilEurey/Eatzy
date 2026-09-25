import { bangkokMonthRange, currentBangkokMonth, shiftMonth, statementTotals } from '../wallet-statement';

describe('wallet statement', () => {
  it('uses the Bangkok calendar month, not UTC', () => {
    // 2026-08-31 18:00 UTC is already 2026-09-01 01:00 in Bangkok.
    expect(currentBangkokMonth(new Date('2026-08-31T18:00:00Z'))).toEqual({ year: 2026, month: 8 });
    expect(bangkokMonthRange({ year: 2026, month: 8 })).toEqual({
      start: '2026-08-31T17:00:00.000Z',
      end: '2026-09-30T17:00:00.000Z',
    });
  });

  it('shifts across year boundaries', () => {
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2025, month: 11 }, 1)).toEqual({ year: 2026, month: 0 });
  });

  it('totals money in/out by sign', () => {
    expect(statementTotals([{ amount: 100 }, { amount: -45 }, { amount: 20 }, { amount: -30 }]))
      .toEqual({ moneyIn: 120, moneyOut: 75, net: 45 });
  });
});
