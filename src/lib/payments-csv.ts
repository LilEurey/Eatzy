// CSV for the vendor Finance "Export" button. Pure — see __tests__/payments-csv.test.ts.

type Row = { created_at: string; display_id: string; amount: number; method: string; status: string };

// RFC 4180 quoting, plus a leading ' on =+-@ so Excel/Sheets don't run it as a formula.
const cell = (v: string | number) => {
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function paymentsCsv(rows: Row[]): string {
  const header = ['Date (Bangkok)', 'Order', 'Amount (THB)', 'Method', 'Status'];
  const lines = rows.map(r => [
    new Date(r.created_at).toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }), // yyyy-mm-dd hh:mm:ss
    r.display_id,
    r.amount.toFixed(2),
    r.method,
    r.status,
  ]);
  // BOM so Excel opens UTF-8 (Thai text) correctly.
  return '﻿' + [header, ...lines].map(l => l.map(cell).join(',')).join('\r\n');
}
