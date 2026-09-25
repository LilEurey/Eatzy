// HTML for the vendor "Download Report" PDF (expo-print renders it). Pure so
// the numbers/escaping stay unit-testable — see __tests__/sales-report.test.ts.
// ponytail: English-only labels; route through translateActive() if Thai vendors ask.

import { formatBaht } from '@/lib/money';
import { isEarned, isVoided, type OrderStatus } from '@/lib/order-lifecycle';
import type { ItemSales, PeriodDelta } from '@/lib/vendor-analytics';

export type ReportInput = {
  vendorName: string;
  rangeLabel: string;
  generatedAt: string;
  orders: { status: OrderStatus; total_amount: number }[]; // already range-filtered
  revenueDelta: PeriodDelta;
  ordersDelta: PeriodDelta;
  avgFulfilmentMin: number | null;
  items: ItemSales[];
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const delta = (d: PeriodDelta) =>
  d ? ` <span class="${d.direction}">${d.direction === 'down' ? '▼' : d.direction === 'up' ? '▲' : '–'} ${d.pct}%</span>` : '';

export function salesReportHtml(r: ReportInput): string {
  const earned = r.orders.filter(o => isEarned(o.status));
  const revenue = earned.reduce((s, o) => s + o.total_amount, 0);
  const valid = r.orders.filter(o => !isVoided(o.status)).length;
  const rejected = r.orders.filter(o => o.status === 'rejected').length;
  const cancelled = r.orders.filter(o => o.status === 'cancelled').length;
  const aov = earned.length ? revenue / earned.length : 0;
  const rejectRate = r.orders.length ? Math.round((rejected / r.orders.length) * 100) : 0;

  const rows = r.items
    .map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.name)}${it.nameTh ? `<br><small>${esc(it.nameTh)}</small>` : ''}</td><td class="n">${it.units}</td><td class="n">฿${formatBaht(it.revenue)}</td></tr>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,Helvetica,sans-serif;color:#1a1d26;padding:32px}
h1{margin:0;font-size:22px}.muted{color:#8A8F9B;font-size:12px}
.grid{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}
.card{flex:1;min-width:140px;border:1px solid #EEF0F5;border-radius:10px;padding:12px}
.card b{display:block;font-size:20px;margin-top:4px}
.up{color:#16a34a;font-size:12px}.down{color:#dc2626;font-size:12px}.flat{color:#8A8F9B;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:8px;border-bottom:1px solid #EEF0F5;text-align:left}
.n{text-align:right}small{color:#8A8F9B}
</style></head><body>
<h1>${esc(r.vendorName)} — Sales Report</h1>
<div class="muted">${esc(r.rangeLabel)} · Generated ${esc(r.generatedAt)}</div>
<div class="grid">
<div class="card">Revenue (completed)<b>฿${formatBaht(revenue)}${delta(r.revenueDelta)}</b></div>
<div class="card">Orders<b>${valid}${delta(r.ordersDelta)}</b></div>
<div class="card">Avg order value<b>฿${formatBaht(aov)}</b></div>
<div class="card">Avg fulfilment<b>${r.avgFulfilmentMin != null ? `${r.avgFulfilmentMin} min` : '—'}</b></div>
</div>
<div class="grid">
<div class="card">Completed<b>${earned.length}</b></div>
<div class="card">Rejected<b>${rejected}</b></div>
<div class="card">Cancelled<b>${cancelled}</b></div>
<div class="card">Rejection rate<b>${rejectRate}%</b></div>
</div>
<h3>Item sales</h3>
${rows ? `<table><tr><th>#</th><th>Item</th><th class="n">Units</th><th class="n">Revenue</th></tr>${rows}</table>` : '<p class="muted">No sales in this period.</p>'}
</body></html>`;
}
