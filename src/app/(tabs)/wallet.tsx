import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brand } from '@/constants/theme';
import { MOCK_WALLET_BALANCE, MOCK_WALLET_TRANSACTIONS } from '@/lib/mock-data';

type TxType = 'topup' | 'payment' | 'refund' | 'transfer';

const TX_CONFIG: Record<TxType, { icon: string; color: string }> = {
  topup:    { icon: '↓', color: '#16a34a' },
  payment:  { icon: '↑', color: '#dc2626' },
  refund:   { icon: '↩', color: '#2563eb' },
  transfer: { icon: '⇄', color: '#7c3aed' },
};

const TOP_UP_AMOUNTS = [100, 200, 500];

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 86400) return 'Today ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  if (diff < 172800) return 'Yesterday ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

export default function WalletScreen() {
  const [balance, setBalance] = useState(MOCK_WALLET_BALANCE);
  const [txns, setTxns] = useState(MOCK_WALLET_TRANSACTIONS);

  // ponytail: local mock top-up. Route through the topup_wallet RPC when the DB is live.
  function topUp(amount: number) {
    setBalance(b => b + amount);
    setTxns(prev => [
      { id: `wt${Date.now()}`, type: 'topup' as const, amount, description: 'Wallet top-up', created_at: new Date().toISOString() },
      ...prev,
    ]);
  }

  const comingSoon = () => Alert.alert('Coming soon', 'This feature isn’t available yet.');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: Brand.textPrimary, letterSpacing: -0.5 }}>
            Wallet
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
              CAMPUS WALLET BALANCE
            </Text>
            <Text style={{ fontSize: 44, fontWeight: '800', color: '#fff', letterSpacing: -1, marginBottom: 20 }}>
              ฿{balance.toLocaleString()}.00
            </Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              {TOP_UP_AMOUNTS.map(amount => (
                <TouchableOpacity
                  key={amount}
                  onPress={() => topUp(amount)}
                  style={{
                    flex: 1, backgroundColor: 'rgba(255,255,255,0.2)',
                    borderRadius: 12, paddingVertical: 10, alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>+฿{amount}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Quick actions */}
        <View style={{ flexDirection: 'row', gap: 12, marginHorizontal: 20, marginBottom: 28 }}>
          {[
            { icon: '↓', label: 'Top Up', onPress: () => topUp(100) },
            { icon: '⇄', label: 'Transfer', onPress: comingSoon },
            { icon: '📄', label: 'Statement', onPress: comingSoon },
          ].map(({ icon, label, onPress }) => (
            <TouchableOpacity
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
            </TouchableOpacity>
          ))}
        </View>

        {/* Transactions */}
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: Brand.textPrimary, marginBottom: 14 }}>
            Recent Transactions
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
                        {formatDate(tx.created_at)}
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
