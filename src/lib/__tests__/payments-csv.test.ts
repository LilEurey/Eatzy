import { paymentsCsv } from '@/lib/payments-csv';

test('payments csv', () => {
  const csv = paymentsCsv([
    { created_at: '2026-06-15T05:00:00Z', display_id: '#12', amount: 45.5, method: 'wallet', status: 'COMPLETED' },
    { created_at: '2026-06-15T05:00:00Z', display_id: '=HACK()', amount: 1, method: 'a,"b"', status: 'COMPLETED' },
  ]);
  const lines = csv.split('\r\n');
  expect(lines[0].startsWith('﻿Date')).toBe(true);
  expect(lines[1]).toBe('2026-06-15 12:00:00,#12,45.50,wallet,COMPLETED');
  expect(lines[2]).toBe(`2026-06-15 12:00:00,'=HACK(),1.00,"a,""b""",COMPLETED`);
});
