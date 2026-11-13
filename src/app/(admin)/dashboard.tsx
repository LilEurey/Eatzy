import { useCallback, useState } from 'react';
import { View, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SkeletonList } from '@/components/Skeleton';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { formatBaht } from '@/lib/money';
import { timeAgo } from '@/lib/relative-time';
import { supabase } from '@/lib/supabase';

type Stats = {
  students: number; vendors: number; new_this_week: number;
  active_15m: number; active_today: number; active_7d: number;
  orders_today: number; revenue_today: number; open_stalls: number; total_stalls: number;
  recent_active: { name: string | null; email: string; role: string; seen_at: string }[];
};

export default function AdminDashboardScreen() {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('admin_dashboard_stats');
    if (err) { setError(err.message); return; }
    setError(null);
    setStats(data as unknown as Stats);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (error) return <Text style={{ fontSize: 14, color: Brand.textSecondary }}>{error}</Text>;
  if (!stats) return <SkeletonList rows={4} padded={false} />;

  const cards: [string, string][] = [
    [t('admin.dashboard.activeNow'), String(stats.active_15m)],
    [t('admin.dashboard.activeToday'), String(stats.active_today)],
    [t('admin.dashboard.active7d'), String(stats.active_7d)],
    [t('admin.dashboard.students'), String(stats.students)],
    [t('admin.dashboard.vendors'), String(stats.vendors)],
    [t('admin.dashboard.newThisWeek'), String(stats.new_this_week)],
    [t('admin.dashboard.ordersToday'), String(stats.orders_today)],
    [t('admin.dashboard.revenueToday'), formatBaht(stats.revenue_today)],
    [t('admin.dashboard.openStalls'), `${stats.open_stalls} / ${stats.total_stalls}`],
  ];

  return (
    <View>
      <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.3, color: Brand.textPrimary, marginBottom: 4 }}>
        {t('admin.dashboard.title')}
      </Text>
      <Text style={{ fontSize: 14, color: Brand.textSecondary, marginBottom: 20 }}>
        {t('admin.dashboard.subtitle')}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        {cards.map(([label, value]) => (
          <View key={label} style={{ flexBasis: '31%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E2E4EC', padding: 14 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: Brand.textPrimary }}>{value}</Text>
            <Text style={{ fontSize: 12, color: Brand.textSecondary, marginTop: 2 }}>{label}</Text>
          </View>
        ))}
      </View>

      <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary, marginBottom: 10 }}>
        {t('admin.dashboard.recentActive')}
      </Text>
      {stats.recent_active.length === 0 ? (
        <Text style={{ fontSize: 14, color: Brand.textSecondary }}>{t('admin.dashboard.noneActive')}</Text>
      ) : (
        <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E2E4EC', overflow: 'hidden' }}>
          {stats.recent_active.map((u, i) => (
            <View key={u.email} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: '#EEF0F5' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: Brand.textPrimary }}>{u.name ?? u.email}</Text>
                <Text style={{ fontSize: 12, color: '#9AA0AE' }}>{u.email} · {u.role}</Text>
              </View>
              <Text style={{ fontSize: 12, color: Brand.textSecondary }}>{timeAgo(u.seen_at, t)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
