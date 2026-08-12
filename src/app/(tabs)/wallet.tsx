import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Tap } from '@/components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';
import { BANGKOK_TZ } from '@/lib/time';

type TxType = 'topup' | 'payment' | 'refund' | 'transfer';
type WalletTxn = { id: string; type: TxType; amount: number; description: string | null; created_at: string };

const TX_CONFIG: Record<TxType, { icon: string; color: string }> = {
  topup:    { icon: '↓', color: '#16a34a' },
  payment:  { icon: '↑', color: '#dc2626' },
  refund:   { icon: '↩', color: '#2563eb' },
  transfer: { icon: '⇄', color: '#7c3aed' },
};

const TOP_UP_AMOUNTS = [100, 200, 500];

function formatDate(iso: string, t: ReturnType<typeof useI18n>['t']) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 86400) return t('common.today') + ' ' + d.toLocaleTimeString('th-TH', { timeZone: BANGKOK_TZ, hour: '2-digit', minute: '2-digit' });
  if (diff < 172800) return t('common.yesterday') + ' ' + d.toLocaleTimeString('th-TH', { timeZone: BANGKOK_TZ, hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { timeZone: BANGKOK_TZ, day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('th-TH', { timeZone: BANGKOK_TZ, hour: '2-digit', minute: '2-digit' });
}

export default function WalletScreen() {
  const { t } = useI18n();
  const [balance, setBalance] = useState(0);
  const [txns, setTxns] = useState<WalletTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [toppingUp, setToppingUp] = useState(false);

  async function loadWallet(userId: string) {
    const [profileRes, txnsRes] = await Promise.all([
      supabase.from('users').select('wallet_balance').eq('id', userId).maybeSingle(),
      supabase.from('wallet_transactions').select('id,type,amount,description,created_at').eq('user_id', userId).order('created_at', { ascending: false }),
    ]);
    setBalance(profileRes.data?.wallet_balance ?? 0);
    setTxns((txnsRes.data ?? []) as WalletTxn[]);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      loadWallet(user.id).then(() => setLoading(false));
    });
  }, []);

  async function topUp(amount: number) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showAlert(t('common.comingSoonTitle'), t('common.comingSoonMsg')); return; }
    setToppingUp(true);
    const { error } = await supabase.rpc('topup_wallet', { p_user_id: user.id, p_amount: amount });
    if (error) {
      showAlert(t('wallet.topUpFailedTitle'), error.message);
    } else {
      await loadWallet(user.id);
    }
    setToppingUp(false);
  }

  const comingSoon = () => showAlert(t('common.comingSoonTitle'), t('common.comingSoonMsg'));

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
              ฿{balance.toLocaleString()}.00
            </Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              {TOP_UP_AMOUNTS.map(amount => (
                <Tap
                  key={amount}
                  onPress={() => topUp(amount)}
                  disabled={toppingUp}
                  style={{
                    flex: 1, backgroundColor: 'rgba(255,255,255,0.2)',
                    borderRadius: 12, paddingVertical: 10, alignItems: 'center',
                    opacity: toppingUp ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>+฿{amount}</Text>
                </Tap>
              ))}
            </View>
          </View>
        </View>

        {/* Quick actions */}
        <View style={{ flexDirection: 'row', gap: 12, marginHorizontal: 20, marginBottom: 28 }}>
          {[
            { icon: '↓', label: t('wallet.topUp'), onPress: () => topUp(100) },
            { icon: '⇄', label: t('wallet.transfer'), onPress: comingSoon },
            { icon: '📄', label: t('wallet.statement'), onPress: comingSoon },
          ].map(({ icon, label, onPress }) => (
            <Tap
              key={label}
              onPress={onPress}
              style={{
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
                        {tx.description}
                      </Text>
                      <Text style={{ fontSize: 12, color: Brand.textSecondary }}>
                        {formatDate(tx.created_at, t)}
                      </Text>
                    </View>

                    {/* Amount */}
                    <Text style={{ fontSize: 15, fontWeight: '700', color: isPositive ? '#16a34a' : Brand.textPrimary }}>
                      {isPositive ? '+' : ''}฿{Math.abs(tx.amount)}
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
