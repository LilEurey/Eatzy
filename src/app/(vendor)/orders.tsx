import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { useVendorOrders, acceptOrder, rejectOrder, markReady, handOff, toggleItemDone } from '@/lib/vendor-store';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';

type VendorOrder = ReturnType<typeof useVendorOrders>[number];

function formatCountdown(seconds: number) {
  const clamped = Math.max(0, seconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function CountdownChip({ initialSeconds }: { initialSeconds: number }) {
  const [seconds, setSeconds] = useState(initialSeconds);
  useEffect(() => {
    const id = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const low = seconds < 120;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: low ? '#FEE2E2' : '#FFF1E6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    }}>
      <Ionicons name="time-outline" size={11} color={low ? '#dc2626' : Brand.orange} />
      <Text style={{ fontSize: 11, fontWeight: '700', color: low ? '#dc2626' : Brand.orange }}>
        {formatCountdown(seconds)}
      </Text>
    </View>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#EEF0F5', gap: 10 }}>
      {children}
    </View>
  );
}

function SpecialBanner({ text, t }: { text: string; t: ReturnType<typeof useI18n>['t'] }) {
  return (
    <View style={{ backgroundColor: '#FEF2F2', borderRadius: 8, padding: 8 }}>
      <Text style={{ fontSize: 11.5, color: '#B91C1C' }}>
        <Text style={{ fontWeight: '700' }}>{t('vendor.orders.special')}</Text>{text}
      </Text>
    </View>
  );
}

function IncomingCard({ order, t }: { order: VendorOrder; t: ReturnType<typeof useI18n>['t'] }) {
  return (
    <CardShell>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ fontSize: 15, fontWeight: '800', color: Brand.textPrimary }}>#{order.queue_number}</Text>
          <Text style={{ fontSize: 10.5, color: '#8A8F9B', fontWeight: '600' }}>
            {t('vendor.orders.pickup')} {order.pickup_start}
          </Text>
        </View>
        <CountdownChip initialSeconds={order.prep_seconds ?? 900} />
      </View>
      <View style={{ gap: 3 }}>
        {order.items.map((it, i) => (
          <Text key={i} style={{ fontSize: 13, color: Brand.textPrimary }}>{it.quantity}x {it.name}</Text>
        ))}
      </View>
      {order.special_request && <SpecialBanner text={order.special_request} t={t} />}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity onPress={() => rejectOrder(order.id)} style={{ flex: 1, backgroundColor: '#F0F1F5', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#4B4F58' }}>{t('vendor.orders.reject')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => acceptOrder(order.id)} style={{ flex: 1, backgroundColor: Brand.orange, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#fff' }}>{t('vendor.orders.confirmStart')}</Text>
        </TouchableOpacity>
      </View>
    </CardShell>
  );
}

function PreparingCard({ order, t }: { order: VendorOrder; t: ReturnType<typeof useI18n>['t'] }) {
  const comingSoon = () => showAlert(t('common.comingSoonTitle'), t('common.comingSoonMsg'));
  return (
    <CardShell>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: Brand.textPrimary }}>#{order.queue_number}</Text>
        <Text style={{ fontSize: 11, color: '#8A8F9B', fontWeight: '600' }}>{order.pickup_start}</Text>
      </View>
      <View style={{ gap: 6 }}>
        {order.items.map((it, i) => (
          <TouchableOpacity key={i} onPress={() => toggleItemDone(order.id, i)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{
              width: 16, height: 16, borderRadius: 4, borderWidth: 1.5,
              borderColor: it.done ? Brand.vendorAccent : '#C9CCD6',
              backgroundColor: it.done ? Brand.vendorAccent : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {it.done && <Ionicons name="checkmark" size={11} color="#fff" />}
            </View>
            <Text style={{ fontSize: 13, color: Brand.textPrimary, textDecorationLine: it.done ? 'line-through' : 'none' }}>
              {it.quantity}x {it.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {order.special_request && <SpecialBanner text={order.special_request} t={t} />}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity onPress={comingSoon} style={{ flex: 1, backgroundColor: '#F0F1F5', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#4B4F58' }}>{t('vendor.orders.issue')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => markReady(order.id)} style={{ flex: 1, backgroundColor: Brand.vendorAccent, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#fff' }}>{t('vendor.orders.markReady')}</Text>
        </TouchableOpacity>
      </View>
    </CardShell>
  );
}

function ReadyCard({ order, t }: { order: VendorOrder; t: ReturnType<typeof useI18n>['t'] }) {
  return (
    <CardShell>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: Brand.textPrimary }}>#{order.queue_number}</Text>
        <View style={{ backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#16a34a' }}>{t('vendor.orders.waiting')}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 12.5, color: Brand.textSecondary }}>
        {t('vendor.orders.itemsPaid', { n: order.items.reduce((s, i) => s + i.quantity, 0) })}
      </Text>
      <TouchableOpacity onPress={() => handOff(order.id)} style={{ backgroundColor: Brand.vendorAccentLight, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: Brand.vendorAccent }}>{t('vendor.orders.handedToCustomer')}</Text>
      </TouchableOpacity>
    </CardShell>
  );
}

export default function VendorOrdersScreen() {
  const { t } = useI18n();
  const orders = useVendorOrders();

  const incoming = orders.filter(o => o.status === 'pending');
  const preparing = orders.filter(o => o.status === 'accepted');
  const ready = orders.filter(o => o.status === 'ready');
  const activeCount = incoming.length + preparing.length + ready.length;

  const comingSoon = () => showAlert(t('common.comingSoonTitle'), t('common.comingSoonMsg'));

  const columns: { key: string; dot: string; titleKey: 'vendor.orders.incoming' | 'vendor.orders.preparing' | 'vendor.orders.readyForPickup'; data: VendorOrder[]; render: (o: VendorOrder) => React.ReactNode }[] = [
    { key: 'incoming', dot: '#ef4444', titleKey: 'vendor.orders.incoming', data: incoming, render: o => <IncomingCard key={o.id} order={o} t={t} /> },
    { key: 'preparing', dot: '#f59e0b', titleKey: 'vendor.orders.preparing', data: preparing, render: o => <PreparingCard key={o.id} order={o} t={t} /> },
    { key: 'ready', dot: '#22c55e', titleKey: 'vendor.orders.readyForPickup', data: ready, render: o => <ReadyCard key={o.id} order={o} t={t} /> },
  ];

  return (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: Brand.textPrimary }}>{t('vendor.orders.title')}</Text>
          <View style={{ backgroundColor: Brand.vendorAccentLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: Brand.vendorAccent }}>{t('vendor.orders.activeCount', { n: activeCount })}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={comingSoon} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#fff' }}>
          <Ionicons name="filter-outline" size={14} color={Brand.textPrimary} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary }}>{t('vendor.orders.filter')}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {columns.map(col => (
          <View key={col.key} style={{ flex: 1, minWidth: 260, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: col.dot }} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: Brand.textPrimary }}>{t(col.titleKey)}</Text>
              <Text style={{ fontSize: 12, color: '#8A8F9B', fontWeight: '600' }}>{col.data.length}</Text>
            </View>
            <View style={{ gap: 12 }}>
              {col.data.length === 0 ? (
                <Text style={{ fontSize: 12, color: '#B0B4BF', paddingVertical: 8 }}>{t('vendor.orders.emptyColumn')}</Text>
              ) : (
                col.data.map(col.render)
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
