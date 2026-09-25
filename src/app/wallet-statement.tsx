import { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Tap } from '@/components/Tap';
import { supabase } from '@/lib/supabase';
import { formatBaht } from '@/lib/money';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { formatFriendlyDateTime } from '@/lib/time';
import { useFocusGuard } from '@/hooks/useFocusGuard';
import {
  bangkokMonthRange, currentBangkokMonth, formatStatementMonth, shiftMonth, statementTotals,
  type StatementMonth,
} from '@/lib/wallet-statement';

type TxType = 'topup' | 'payment' | 'refund' | 'transfer';
type WalletTxn = { id: string; type: TxType; amount: number; created_at: string };

const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '-' : '') + '฿' + formatBaht(Math.abs(n));

export default function WalletStatementScreen() {
  const { t, locale } = useI18n();
  const [month, setMonth] = useState<StatementMonth>(() => currentBangkokMonth());
  const [txns, setTxns] = useState<WalletTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const focusGuard = useFocusGuard();
  const now = currentBangkokMonth();
  const isCurrentMonth = month.year === now.year && month.month === now.month;
  const monthLabel = formatStatementMonth(month, locale === 'th' ? 'th-TH' : 'en-GB');

  const load = useCallback((m: StatementMonth, cancelledRef: { current: boolean }) => {
    setLoading(true);
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { if (!cancelledRef.current) setLoading(false); return; }
      const { start, end } = bangkokMonthRange(m);
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('id,type,amount,created_at')
        .eq('user_id', user.id)
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false });
      if (cancelledRef.current) return;
      setLoadFailed(!!error);
      if (!error) setTxns((data ?? []) as WalletTxn[]);
      setLoading(false);
    });
  }, []);

  useFocusEffect(useCallback(() => { load(month, focusGuard.snapshot()); }, [focusGuard, load, month]));

  const totals = statementTotals(txns);

  const share = () => {
    const lines = [
      `Eatzy ${t('wallet.statement')} — ${monthLabel}`,
      `${t('wallet.statementIn')}: ${signed(totals.moneyIn)}`,
      `${t('wallet.statementOut')}: ${signed(-totals.moneyOut)}`,
      `${t('wallet.statementNet')}: ${signed(totals.net)}`,
      '',
      ...txns.map(tx => `${formatFriendlyDateTime(tx.created_at, t('common.today'))}  ${t(`wallet.txn.${tx.type}` as const)}  ${signed(tx.amount)}`),
    ];
    Share.share({ message: lines.join('\n') }).catch(() => {});
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 12 }}>
        <Tap onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
        </Tap>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: Brand.textPrimary }}>{t('wallet.statement')}</Text>
        <Tap onPress={share} disabled={loading || loadFailed}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: Brand.orange }}>{t('wallet.statementShare')}</Text>
        </Tap>
      </View>

      {/* Month picker */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
        <Tap onPress={() => setMonth(m => shiftMonth(m, -1))} style={{ padding: 8 }}>
          <Text style={{ fontSize: 20, color: Brand.orange }}>‹</Text>
        </Tap>
        <Text style={{ fontSize: 16, fontWeight: '700', color: Brand.textPrimary }}>{monthLabel}</Text>
        <Tap onPress={() => setMonth(m => shiftMonth(m, 1))} disabled={isCurrentMonth} style={{ padding: 8, opacity: isCurrentMonth ? 0.3 : 1 }}>
          <Text style={{ fontSize: 20, color: Brand.orange }}>›</Text>
        </Tap>
      </View>

      {loading ? (
        <ActivityIndicator color={Brand.orange} size="large" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
          {loadFailed && (
            <Tap onPress={() => load(month, focusGuard.snapshot())} haptic={false} style={{
              marginBottom: 16, backgroundColor: '#fee2e2', borderRadius: 12,
              borderWidth: 1, borderColor: '#fecaca', paddingHorizontal: 14, paddingVertical: 12,
            }}>
              <Text style={{ fontSize: 13, color: '#b91c1c', fontWeight: '700' }}>
                {t('common.errorTitle')} · {t('common.tryAgain')}
              </Text>
            </Tap>
          )}

          {/* Totals */}
          <View style={{ backgroundColor: Brand.card, borderRadius: 20, padding: 16, marginBottom: 20, gap: 10 }}>
            {[
              { label: t('wallet.statementIn'), value: signed(totals.moneyIn), color: '#16a34a' },
              { label: t('wallet.statementOut'), value: signed(-totals.moneyOut), color: Brand.textPrimary },
              { label: t('wallet.statementNet'), value: signed(totals.net), color: Brand.textPrimary },
            ].map(({ label, value, color }) => (
              <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, color: Brand.textSecondary }}>{label}</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color }}>{value}</Text>
              </View>
            ))}
          </View>

          {/* Transactions */}
          <View style={{ backgroundColor: Brand.card, borderRadius: 20, overflow: 'hidden' }}>
            {txns.length === 0 && !loadFailed && (
              <Text style={{ fontSize: 14, color: Brand.textSecondary, textAlign: 'center', paddingVertical: 32 }}>
                {t('wallet.statementEmpty')}
              </Text>
            )}
            {txns.map((tx, i) => (
              <View key={tx.id}>
                {i > 0 && <View style={{ height: 1, backgroundColor: Brand.border, marginHorizontal: 16 }} />}
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: Brand.textPrimary }} numberOfLines={1}>
                      {t(`wallet.txn.${tx.type}` as const)}
                    </Text>
                    <Text style={{ fontSize: 12, color: Brand.textSecondary }}>
                      {formatFriendlyDateTime(tx.created_at, t('common.today'))}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: tx.amount > 0 ? '#16a34a' : Brand.textPrimary }}>
                    {signed(tx.amount)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
