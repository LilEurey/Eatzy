import { salesReportHtml } from '@/lib/sales-report';

// order-lifecycle pulls in react-native via @/lib/alert — stub it (see vendor-analytics.test.ts).
jest.mock('@/lib/alert', () => ({ showAlert: jest.fn() }));

test('sales report totals and escaping', () => {
  const html = salesReportHtml({
    vendorName: 'Pad <Thai>',
    rangeLabel: 'Today',
    generatedAt: 'now',
    orders: [
      { status: 'completed', total_amount: 60 },
      { status: 'completed', total_amount: 40 },
      { status: 'pending', total_amount: 30 },
      { status: 'rejected', total_amount: 50 },
    ],
    revenueDelta: { pct: 10, direction: 'up' },
    ordersDelta: null,
    avgFulfilmentMin: null,
    items: [{ menuItemId: 'a', name: 'Rice', nameTh: null, units: 3, revenue: 90, orderCount: 2 }],
  });
  expect(html).toContain('Pad &lt;Thai&gt;');
  expect(html).toContain('฿100.00'); // completed only
  expect(html).toContain('<b>3'); // non-voided orders
  expect(html).toContain('฿50.00'); // AOV
  expect(html).toContain('25%'); // 1 of 4 rejected
  expect(html).toContain('▲ 10%');
});
