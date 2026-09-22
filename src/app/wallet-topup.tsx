import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Tap } from '@/components/Tap';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { useStripe, COLLECT_NEVER } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { invokeEdgeFunction } from '@/lib/edge-function';
import { showAlert, comingSoonAlert } from '@/lib/alert';
import { useFocusGuard } from '@/hooks/useFocusGuard';

const PRESET_AMOUNTS = [100, 200, 500, 1000];
const MIN_TOPUP = 20;
const MAX_TOPUP = 10000;
// PaymentSheet success only means Stripe confirmed; stripe-webhook credits the wallet a moment later.
const WEBHOOK_CREDIT_WAIT_MS = 1500;
// How long the inline success state stays up before navigating back.
const SUCCESS_DISPLAY_MS = 1000;

export default function WalletTopUpScreen() {
  const { t } = useI18n();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [amountText, setAmountText] = useState('');
  const [paying, setPaying] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const cancelledRef = useFocusGuard();

  const amount = Number(amountText);
  const isValid = amountText.length > 0 && Number.isFinite(amount) && amount >= MIN_TOPUP && amount <= MAX_TOPUP;

  const selectedPreset = useMemo(
    () => PRESET_AMOUNTS.find(p => String(p) === amountText),
    [amountText],
  );

  async function payNow() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { comingSoonAlert(t); return; }
    setPaying(true);

    const { data: intentData, error: intentError } = await invokeEdgeFunction<{ client_secret: string }>(
      'create-topup-intent',
      { body: { amount } },
    );
    if (cancelledRef.current) return;
    if (intentError || !intentData?.client_secret) {
      showAlert(t('wallet.topUpFailedTitle'), intentError?.message ?? 'Could not start payment');
      setPaying(false);
      return;
    }

    const { error: initError } = await initPaymentSheet({
      paymentIntentClientSecret: intentData.client_secret,
      merchantDisplayName: 'Eatzy',
      // PromptPay is a redirect-based method: without returnURL the iOS sheet
      // hides it, and it's our only method. Deep link lands back on this route.
      returnURL: 'eatzy://wallet-topup',
      // PromptPay requires an email. Prefill from the account and tell the
      // sheet not to ask, so students don't retype it on every top-up.
      defaultBillingDetails: { email: user.email },
      billingDetailsCollectionConfiguration: {
        email: COLLECT_NEVER,
        attachDefaultsToPaymentMethod: true,
      },
    });
    if (cancelledRef.current) return;
    if (initError) {
      showAlert(t('wallet.topUpFailedTitle'), initError.message);
      setPaying(false);
      return;
    }

    const { error: presentError } = await presentPaymentSheet();
    if (cancelledRef.current) return;
    if (presentError) {
      // 'Canceled' means the student closed the sheet — not a failure, let them retry.
      if (presentError.code !== 'Canceled') showAlert(t('wallet.topUpFailedTitle'), presentError.message);
      setPaying(false);
      return;
    }

    // PaymentSheet resolving success only means Stripe confirmed the charge
    // client-side — the wallet is credited by stripe-webhook (payment_intent.
    // succeeded), which typically lands within a second or two of this point
    // but isn't guaranteed to have run yet.
    await new Promise(resolve => setTimeout(resolve, WEBHOOK_CREDIT_WAIT_MS));
    if (cancelledRef.current) return;
    setPaying(false);
    setSucceeded(true);
    setTimeout(() => { if (!cancelledRef.current) router.back(); }, SUCCESS_DISPLAY_MS);
  }

  if (succeeded) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <View style={{
          width: 72, height: 72, borderRadius: 36, backgroundColor: '#16a34a',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 32, color: '#fff' }}>✓</Text>
        </View>
        <Text style={{ fontSize: 17, fontWeight: '700', color: Brand.textPrimary }}>
          {t('wallet.topUpSuccess', { amount })}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 12 }}>
        <Tap onPress={() => router.back()} disabled={paying}>
          <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
        </Tap>
        <Text style={{ fontSize: 20, fontWeight: '700', color: Brand.textPrimary }}>{t('wallet.topUpAmountTitle')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 160 }}>
        {/* Presets */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.8, marginTop: 12, marginBottom: 10 }}>
          {t('wallet.topUp').toUpperCase()}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {PRESET_AMOUNTS.map(preset => {
            const active = selectedPreset === preset;
            return (
              <Tap
                key={preset}
                onPress={() => setAmountText(String(preset))}
                disabled={paying}
                style={{
                  paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12,
                  backgroundColor: active ? Brand.orange : Brand.card,
                  borderWidth: active ? 0 : 1.5, borderColor: Brand.border,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: active ? 0 : 0.03, shadowRadius: 3, elevation: active ? 0 : 1,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: active ? '#fff' : Brand.textPrimary }}>
                  ฿{preset}
                </Text>
              </Tap>
            );
          })}
        </View>

        {/* Custom amount */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.8, marginBottom: 10 }}>
          {t('wallet.topUpCustomLabel').toUpperCase()}
        </Text>
        <View style={{
          backgroundColor: Brand.card, borderRadius: 20, padding: 16,
          flexDirection: 'row', alignItems: 'center', gap: 8,
          borderWidth: 1.5, borderColor: amountText.length > 0 && !isValid ? '#dc2626' : Brand.border,
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
        }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: Brand.textPrimary }}>฿</Text>
          <TextInput
            value={amountText}
            onChangeText={v => setAmountText(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={Brand.textSecondary}
            editable={!paying}
            style={{ flex: 1, fontSize: 28, fontWeight: '800', color: Brand.textPrimary }}
          />
        </View>
        <Text style={{
          fontSize: 12, marginTop: 8, fontWeight: '600',
          color: amountText.length > 0 && !isValid ? '#dc2626' : Brand.textSecondary,
        }}>
          {amountText.length > 0 && !isValid ? t('wallet.topUpInvalidAmount') : t('wallet.topUpMinMaxHint')}
        </Text>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: Brand.card, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
        borderTopWidth: 1, borderTopColor: Brand.border,
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06, shadowRadius: 12, elevation: 10,
      }}>
        <Tap
          activeOpacity={0.85}
          onPress={payNow}
          disabled={!isValid || paying}
          style={{
            backgroundColor: Brand.orange, borderRadius: 16,
            paddingVertical: 16, alignItems: 'center', opacity: (!isValid || paying) ? 0.5 : 1,
            shadowColor: Brand.orange, shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
          }}
        >
          {paying ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
              {t('wallet.topUpCta', { amount: isValid ? amount : 0 })}
            </Text>
          )}
        </Tap>
      </View>
    </SafeAreaView>
  );
}
