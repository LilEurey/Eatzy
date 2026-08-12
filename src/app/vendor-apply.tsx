import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type UnclaimedStall = { id: string; name: string; stall_number: string | null };

const ERROR_CODE_KEYS: Record<string, TranslationKey> = {
  EMAIL_IN_USE: 'vendor.apply.emailInUseMsg',
  STALL_ALREADY_PENDING: 'vendor.apply.stallAlreadyPendingMsg',
  STALL_UNAVAILABLE: 'vendor.apply.stallUnavailableMsg',
  PASSWORD_TOO_WEAK: 'vendor.apply.passwordTooShortMsg',
};

export default function VendorApplyScreen() {
  const { t } = useI18n();
  const [stalls, setStalls] = useState<UnclaimedStall[]>([]);
  const [stallsLoading, setStallsLoading] = useState(true);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [bio, setBio] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Unclaimed = no owner yet. A stall with a pending application is still
    // technically unclaimed here — the DB's partial unique index is the real
    // gate against double-claims — but showing it would just invite a
    // doomed submit, so also fetch which stalls already have one pending.
    async function loadStalls() {
      const [{ data: vendors }, { data: pending }] = await Promise.all([
        supabase.from('vendors').select('id,name,stall_number').is('owner_user_id', null).order('name'),
        supabase.rpc('pending_vendor_application_ids'),
      ]);
      const pendingIds = new Set((pending ?? []).map(p => p.vendor_id));
      setStalls((vendors ?? []).filter(v => !pendingIds.has(v.id)));
      setStallsLoading(false);
    }
    void loadStalls();
  }, []);

  const canSubmit =
    !!vendorId && !!fullName.trim() && !!email.trim() && !!phone.trim() &&
    password.length >= 8 && password === confirmPassword && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('apply-vendor-application', {
      body: {
        vendor_id: vendorId,
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        bio: bio.trim() || null,
        password,
      },
    });
    setSubmitting(false);
    if (error || data?.error) {
      const code = data?.code as string | undefined;
      const messageKey = code ? ERROR_CODE_KEYS[code] : undefined;
      showAlert(t('vendor.apply.errorTitle'), messageKey ? t(messageKey) : (data?.error ?? error?.message ?? 'Unknown error'));
      return;
    }
    showAlert(t('vendor.apply.submittedTitle'), t('vendor.apply.submittedMsg'), () => router.back());
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F5F9' }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <View style={{ maxWidth: 420, width: '100%', alignSelf: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: Brand.textPrimary, marginBottom: 6 }}>
            {t('vendor.apply.title')}
          </Text>
          <Text style={{ fontSize: 14, color: Brand.textSecondary, marginBottom: 28 }}>
            {t('vendor.apply.subtitle')}
          </Text>

          <Field label={t('vendor.apply.stallLabel')}>
            {stallsLoading ? null : stalls.length === 0 ? (
              <Text style={{ fontSize: 13, color: Brand.textSecondary, paddingVertical: 8 }}>
                {t('vendor.apply.noStalls')}
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {stalls.map(s => {
                  const selected = vendorId === s.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => setVendorId(s.id)}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 9, borderRadius: 50,
                        backgroundColor: selected ? Brand.vendorAccent : '#fff',
                        borderWidth: 1.5, borderColor: selected ? Brand.vendorAccent : '#E2E4EC',
                      }}
                    >
                      <Text style={{ color: selected ? '#fff' : Brand.textPrimary, fontWeight: '600', fontSize: 13 }}>
                        {s.name}{s.stall_number ? ` (${s.stall_number})` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Field>

          <Field label={t('vendor.apply.fullNameLabel')}>
            <TextInput value={fullName} onChangeText={setFullName} style={inputStyle} placeholderTextColor="#B0B4BF" />
          </Field>

          <Field label={t('vendor.apply.emailLabel')}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={inputStyle}
              placeholderTextColor="#B0B4BF"
            />
          </Field>

          <Field label={t('vendor.apply.phoneLabel')}>
            <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={inputStyle} placeholderTextColor="#B0B4BF" />
          </Field>

          <Field label={t('vendor.apply.passwordLabel')}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t('vendor.apply.passwordPlaceholder')}
              placeholderTextColor="#B0B4BF"
              secureTextEntry
              style={inputStyle}
            />
          </Field>

          <Field label={t('vendor.apply.confirmPasswordLabel')}>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t('vendor.apply.confirmPasswordPlaceholder')}
              placeholderTextColor="#B0B4BF"
              secureTextEntry
              style={inputStyle}
            />
          </Field>

          <Field label={t('vendor.apply.bioLabel')}>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder={t('vendor.apply.bioPlaceholder')}
              placeholderTextColor="#B0B4BF"
              multiline
              numberOfLines={3}
              style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]}
            />
          </Field>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={{
              backgroundColor: Brand.orange, borderRadius: 50, paddingVertical: 14,
              alignItems: 'center', opacity: canSubmit ? 1 : 0.5, marginTop: 8, marginBottom: 16,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
              {submitting ? t('vendor.apply.submitting') : t('vendor.apply.submit')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={{ alignItems: 'center' }}>
            <Text style={{ color: Brand.textSecondary, fontSize: 12 }}>{t('vendor.apply.backToLogin')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary, marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

const inputStyle = {
  borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10,
  paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Brand.textPrimary, backgroundColor: '#fff',
} as const;
