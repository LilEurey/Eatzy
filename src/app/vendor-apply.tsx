import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { Tap } from '@/components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { invokeEdgeFunction } from '@/lib/edge-function';

const ERROR_CODE_KEYS: Record<string, TranslationKey> = {
  NOT_STUDENT: 'vendor.apply.notStudentMsg',
  ALREADY_APPLIED: 'vendor.apply.alreadyAppliedMsg',
};

export default function VendorApplyScreen() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [isOnCampus, setIsOnCampus] = useState(true);
  const [stallNumber, setStallNumber] = useState('');
  const [address, setAddress] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email ?? ''));
  }, []);

  const canSubmit = !!businessName.trim() && !!fullName.trim() && !!phone.trim() && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const { error } = await invokeEdgeFunction('apply-vendor-application', {
      body: {
        business_name: businessName.trim(),
        is_on_campus: isOnCampus,
        stall_number: isOnCampus ? stallNumber.trim() || null : null,
        address: isOnCampus ? null : address.trim() || null,
        full_name: fullName.trim(),
        phone: phone.trim(),
        bio: bio.trim() || null,
      },
    });
    setSubmitting(false);
    if (error) {
      const messageKey = error.code ? ERROR_CODE_KEYS[error.code] : undefined;
      showAlert(t('vendor.apply.errorTitle'), messageKey ? t(messageKey) : error.message);
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

          {!!email && (
            <Text style={{ fontSize: 13, color: Brand.textSecondary, marginBottom: 18 }}>
              {email}
            </Text>
          )}

          <Field label={t('vendor.apply.businessNameLabel')}>
            <TextInput value={businessName} onChangeText={setBusinessName} style={inputStyle} placeholderTextColor="#B0B4BF" />
          </Field>

          <Field label={t('vendor.apply.locationTypeLabel')}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([
                { value: true, label: t('vendor.apply.onCampusOption') },
                { value: false, label: t('vendor.apply.offCampusOption') },
              ] as const).map(option => {
                const selected = isOnCampus === option.value;
                return (
                  <Tap
                    key={String(option.value)}
                    onPress={() => setIsOnCampus(option.value)}
                    style={{
                      flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 50,
                      backgroundColor: selected ? Brand.vendorAccent : '#fff',
                      borderWidth: 1.5, borderColor: selected ? Brand.vendorAccent : '#E2E4EC',
                    }}
                  >
                    <Text style={{ color: selected ? '#fff' : Brand.textPrimary, fontWeight: '600', fontSize: 13 }}>
                      {option.label}
                    </Text>
                  </Tap>
                );
              })}
            </View>
          </Field>

          {isOnCampus ? (
            <Field label={t('vendor.apply.stallNumberLabel')}>
              <TextInput value={stallNumber} onChangeText={setStallNumber} style={inputStyle} placeholderTextColor="#B0B4BF" />
            </Field>
          ) : (
            <Field label={t('vendor.apply.addressLabel')}>
              <TextInput value={address} onChangeText={setAddress} style={inputStyle} placeholderTextColor="#B0B4BF" />
            </Field>
          )}

          <Field label={t('vendor.apply.fullNameLabel')}>
            <TextInput value={fullName} onChangeText={setFullName} style={inputStyle} placeholderTextColor="#B0B4BF" />
          </Field>

          <Field label={t('vendor.apply.phoneLabel')}>
            <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={inputStyle} placeholderTextColor="#B0B4BF" />
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

          <Tap
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
          </Tap>

          <Tap
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            style={{ alignItems: 'center' }}
          >
            <Text style={{ color: Brand.textSecondary, fontSize: 12 }}>{t('vendor.apply.backToLogin')}</Text>
          </Tap>
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
