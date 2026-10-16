import { localizedText, notificationText } from '@/lib/localize';
import type { TranslationKey } from '@/lib/i18n';

describe('localizedText', () => {
  it('returns the base text for the English locale', () => {
    expect(localizedText('Pad Thai', 'ผัดไทย', 'en')).toBe('Pad Thai');
  });

  it('returns the Thai text for the Thai locale when it is present', () => {
    expect(localizedText('Pad Thai', 'ผัดไทย', 'th')).toBe('ผัดไทย');
  });

  it('falls back to base text when the Thai column is empty or whitespace', () => {
    expect(localizedText('Pad Thai', '', 'th')).toBe('Pad Thai');
    expect(localizedText('Pad Thai', '   ', 'th')).toBe('Pad Thai');
    expect(localizedText('Pad Thai', null, 'th')).toBe('Pad Thai');
  });
});

describe('notificationText', () => {
  // Echo the key + params so assertions can see what got rendered.
  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    `${key}::${JSON.stringify(params ?? {})}`;

  it('renders from the event snapshot + params for a known event', () => {
    const out = notificationText(
      { event: 'order_ready', title: 'stored EN', body: 'stored EN', vendor_name: 'Som Tam', queue_number: 7, total_amount: 120 },
      t,
    );
    expect(out.title).toContain('notif.orderReady.title');
    expect(out.body).toContain('"vendor":"Som Tam"');
    expect(out.body).toContain('"queue":"S007"');
  });

  it('falls back to the stored title/body when the event is unknown or null', () => {
    expect(notificationText({ event: null, title: 'Stored', body: 'Body', vendor_name: null, queue_number: null, total_amount: null }, t))
      .toEqual({ title: 'Stored', body: 'Body' });
    expect(notificationText({ event: 'mystery', title: 'Stored', body: 'Body', vendor_name: null, queue_number: null, total_amount: null }, t))
      .toEqual({ title: 'Stored', body: 'Body' });
  });

  it('substitutes an em dash for a missing queue number', () => {
    const out = notificationText(
      { event: 'order_accepted', title: '', body: '', vendor_name: 'X', queue_number: null, total_amount: null },
      t,
    );
    expect(out.body).toContain('"queue":"—"');
  });
});

describe('queueTicket', () => {
  const { queueTicket } = jest.requireActual('@/lib/order-view') as typeof import('@/lib/order-view');
  it('formats vendor initial + padded number', () => {
    expect(queueTicket(7, 'Som Tam')).toBe('S007');
    expect(queueTicket(1042, 'mama noodle')).toBe('M1042');
    expect(queueTicket(5, 'ร้าน 99 Kitchen')).toBe('K005');
    expect(queueTicket(5, null)).toBe('Q005');
    expect(queueTicket(null, 'Som Tam')).toBe('—');
  });
});
