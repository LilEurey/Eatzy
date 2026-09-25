import { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Tap } from '@/components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { formatBaht } from '@/lib/money';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { BANGKOK_TZ, bangkokDayKey } from '@/lib/time';
import { useFocusGuard } from '@/hooks/useFocusGuard';
import type { OrderStatus } from '@/lib/order-lifecycle';

type TxType = 'topup' | 'payment' | 'refund' | 'transfer';
type WalletTxn = { id: string; type: TxType; amount: number; description: string | null; created_at: string };

// Active orders only: their payment has left the wallet but isn't final yet
// (completes to the vendor, or refunds on reject/cancel).
type HeldOrder = { id: string; queue_number: number | null; status: OrderStatus; total_amount: number; vendors: { name: string } | null };
const HELD_STATUSES: OrderStatus[] = ['pending', 'accepted', 'ready'];
const STATUS_KEY = { pending: 'orders.status.pending', accepted: 'orders.status.preparing', ready: 'orders.status.ready' } as const;

const TX_CONFIG: Record<TxType, { icon: string; color: string }> = {
  topup:    { icon: '↓', color: '#16a34a' },
  payment:  { icon: '↑', color: '#dc2626' },
  refund:   { icon: '↩', color: '#2563eb' },
  transfer: { icon: '⇄', color: '#7c3aed' },
};


// Today / Yesterday by Bangkok calendar day, not elapsed 24h — a top-up at
// 23:00 last night is "Yesterday" at 10:00 this morning.
function formatDate(iso: string, t: ReturnType<typeof useI18n>['t']) {
  const d = new Date(iso);
  const now = new Date();
  const day = bangkokDayKey(d);
  if (day === bangkokDayKey(now)) return t('common.today') + ' ' + d.toLocaleTimeString('th-TH', { timeZone: BANGKOK_TZ, hour: '2-digit', minute: '2-digit' });
  if (day === bangkokDayKey(new Date(now.getTime() - 86400000))) return t('common.yesterday') + ' ' + d.toLocaleTimeString('th-TH', { timeZone: BANGKOK_TZ, hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { timeZone: BANGKOK_TZ, day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('th-TH', { timeZone: BANGKOK_TZ, hour: '2-digit', minute: '2-digit' });
}

async function loadWallet(userId: string) {
  const [profileRes, txnsRes, heldRes] = await Promise.all([
    supabase.from('users').select('wallet_balance').eq('id', userId).maybeSingle(),
    // Append-only ledger, no pagination in the UI — cap it so the query
    // doesn't grow for the life of the account. Balance comes from
    // users.wallet_balance, not from summing these, so a cap is display-only.
    supabase.from('wallet_transactions').select('id,type,amount,description,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    supabase.from('orders').select('id,queue_number,status,total_amount,vendors(name)').eq('user_id', userId).in('status', HELD_STATUSES).order('created_at', { ascending: false }),
  ]);
  if (profileRes.error || txnsRes.error || heldRes.error || !profileRes.data) return null;
  return {
    balance: profileRes.data.wallet_balance,
    txns: (txnsRes.data ?? []) as WalletTxn[],
    held: (heldRes.data ?? []) as unknown as HeldOrder[],
  };
}

export default function WalletScreen() {
  const { t } = useI18n();
  const [balance, setBalance] = useState(0);
  const [txns, setTxns] = useState<WalletTxn[]>([]);
  const [held, setHeld] = useState<HeldOrder[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const focusGuard = useFocusGuard();

  const refresh = useCallback((cancelledRef: { current: boolean }) => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { if (!cancelledRef.current) setLoading(false); return; }
      const result = await loadWallet(user.id);
      if (cancelledRef.current) return;
      // On failure keep whatever was last shown instead of a fake ฿0.00 /
      // empty history, and say so.
      setLoadFailed(!result);
      if (result) {
        setBalance(result.balance);
        setTxns(result.txns);
        setHeld(result.held);
      }
      setLoading(false);
    });
  }, []);

  useFocusEffect(useCallback(() => { refresh(focusGuard.snapshot()); }, [focusGuard, refresh]));

  const heldTotal = held.reduce((sum, o) => sum + o.total_amount, 0);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Brand.orange} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: Brand.textPrimary, letterSpacing: -0.5 }}>
            {t('wallet.title')}
          </Text>
        </View>

        {loadFailed && (
          <Tap onPress={() => refresh(focusGuard.snapshot())} haptic={false} style={{
            marginHorizontal: 20, marginBottom: 16, backgroundColor: '#fee2e2', borderRadius: 12,
            borderWidth: 1, borderColor: '#fecaca', paddingHorizontal: 14, paddingVertical: 12,
          }}>
            <Text style={{ fontSize: 13, color: '#b91c1c', fontWeight: '700' }}>
              {t('common.errorTitle')} · {t('common.tryAgain')}
            </Text>
          </Tap>
        )}

        {/* Balance card */}
        <View style={{ marginHorizontal: 20, marginBottom: 24 }}>
          <View style={{
            borderRadius: 28, padding: 28, overflow: 'hidden',
            backgroundColor: Brand.orange,
            shadowColor: Brand.orange, shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.35, shadowRadius: 20, elevation: 8,
          }}>
            {/* Decorative circles */}
            <View style={{
              position: 'absolute', top: -40, right: -40,
              width: 160, height: 160, borderRadius: 80,
              backgroundColor: 'rgba(255,255,255,0.1)',
            }} />
            <View style={{
              position: 'absolute', bottom: -60, right: 40,
              width: 120, height: 120, borderRadius: 60,
              backgroundColor: 'rgba(255,255,255,0.08)',
            }} />

            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '600', marginBottom: 8 }}>
              {t('wallet.balanceLabel')}
            </Text>
            <Text style={{ fontSize: 44, fontWeight: '800', color: '#fff', letterSpacing: -1, marginBottom: 20 }}>
              ฿{formatBaht(balance)}
            </Text>

            <Tap
              onPress={() => router.push('/wallet-topup')}
              style={{
                backgroundColor: 'rgba(255,255,255,0.2)',
                borderRadius: 12, paddingVertical: 12, alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{t('wallet.topUp')}</Text>
            </Tap>
          </View>
        </View>

        {/* Quick actions */}
        <View style={{ flexDirection: 'row', gap: 12, marginHorizontal: 20, marginBottom: 28 }}>
          {[
            { icon: '⏳', label: t('wallet.escrow', { amount: formatBaht(heldTotal) }), onPress: () => setShowHeld(v => !v), dim: held.length === 0 },
            { icon: '📄', label: t('wallet.statement'), onPress: () => router.push('/wallet-statement'), dim: false },
          ].map(({ icon, label, onPress, dim }) => (
            <Tap
              key={icon}
              onPress={onPress}
              style={{
                opacity: dim ? 0.5 : 1,
                flex: 1, backgroundColor: Brand.card, borderRadius: 16,
                paddingVertical: 16, alignItems: 'center', gap: 6,
                shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
              }}
            >
              <View style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 18, color: Brand.orange }}>{icon}</Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: Brand.textSecondary }}>{label}</Text>
            </Tap>
          ))}
        </View>

        {showHeld && (
          <View style={{ marginHorizontal: 20, marginTop: -12, marginBottom: 28, backgroundColor: Brand.card, borderRadius: 20, overflow: 'hidden' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.textSecondary, padding: 16, paddingBottom: 8 }}>
              {t('wallet.escrowTitle')}
            </Text>
            {held.length === 0 && (
              <Text style={{ fontSize: 13, color: Brand.textSecondary, paddingHorizontal: 16, paddingBottom: 16 }}>
                {t('wallet.escrowEmpty')}
              </Text>
            )}
            {held.map((o, i) => (
              <View key={o.id}>
                {i > 0 && <View style={{ height: 1, backgroundColor: Brand.border, marginHorizontal: 16 }} />}
                <Tap onPress={() => router.push(`/track/${o.id}`)} style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: Brand.textPrimary }} numberOfLines={1}>
                      {o.vendors?.name ?? ''}
                    </Text>
                    <Text style={{ fontSize: 12, color: Brand.textSecondary }}>
                      {o.queue_number != null ? t('wallet.escrowQueue', { n: o.queue_number }) + ' · ' : ''}{t(STATUS_KEY[o.status as keyof typeof STATUS_KEY])}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>฿{formatBaht(o.total_amount)}</Text>
                </Tap>
              </View>
            ))}
          </View>
        )}

        {/* Transactions */}
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: Brand.textPrimary, marginBottom: 14 }}>
            {t('wallet.recentTransactions')}
          </Text>

          <View style={{
            backgroundColor: Brand.card, borderRadius: 20,
            overflow: 'hidden',
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
          }}>
            {txns.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
                <Text style={{ fontSize: 36, marginBottom: 10 }}>🧾</Text>
                <Text style={{ fontSize: 15, fontWeight: '600', color: Brand.textPrimary, marginBottom: 4 }}>
                  {t('wallet.noTransactionsTitle')}
                </Text>
                <Text style={{ fontSize: 13, color: Brand.textSecondary, textAlign: 'center' }}>
                  {t('wallet.noTransactionsSubtitle')}
                </Text>
              </View>
            )}
            {txns.map((tx, i) => {
              const cfg = TX_CONFIG[tx.type];
              const isPositive = tx.amount > 0;
              return (
                <View key={tx.id}>
                  {i > 0 && <View style={{ height: 1, backgroundColor: Brand.border, marginHorizontal: 16 }} />}
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 }}>
                    {/* Icon */}
                    <View style={{
                      width: 44, height: 44, borderRadius: 22,
                      backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 18, color: cfg.color, fontWeight: '700' }}>{cfg.icon}</Text>
                    </View>

                    {/* Info */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: Brand.textPrimary, marginBottom: 2 }}
                        numberOfLines={1}>
                        {t(`wallet.txn.${tx.type}` as const)}
                      </Text>
                      <Text style={{ fontSize: 12, color: Brand.textSecondary }}>
                        {formatDate(tx.created_at, t)}
                      </Text>
                    </View>

                    {/* Amount */}
                    <Text style={{ fontSize: 15, fontWeight: '700', color: isPositive ? '#16a34a' : Brand.textPrimary }}>
                      {isPositive ? '+' : ''}฿{formatBaht(Math.abs(tx.amount))}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
