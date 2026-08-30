import { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { Tap } from '@/components/Tap';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';
import { invokeEdgeFunction } from '@/lib/edge-function';

type Created = { email: string; password: string; name: string };

export default function AdminNewVendorScreen() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [cuisineTags, setCuisineTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  const canSubmit = !!email.trim() && password.length >= 6 && !!businessName.trim() && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const { error } = await invokeEdgeFunction('admin-create-vendor', {
      body: {
        email: email.trim(),
        password,
        business_name: businessName.trim(),
        cuisine_tags: cuisineTags.split(',').map((tag) => tag.trim()).filter(Boolean),
      },
    });
    setSubmitting(false);
    if (error) {
      showAlert(t('admin.newVendor.errorTitle'), error.message);
      return;
    }
    setCreated({ email: email.trim(), password, name: businessName.trim() });
  }

  function reset() {
    setEmail('');
    setPassword('');
    setBusinessName('');
    setCuisineTags('');
    setCreated(null);
  }

  if (created) {
    return (
      <View>
        <Text style={{ fontSize: 22, fontWeight: '800', color: Brand.textPrimary, marginBottom: 4 }}>
          {t('admin.newVendor.successTitle')}
        </Text>
        <Text style={{ fontSize: 14, color: Brand.textSecondary, marginBottom: 20 }}>
          {t('admin.newVendor.successMsg', { name: created.name })}
        </Text>

        <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E2E4EC', padding: 16 }}>
          <CredRow label={t('admin.newVendor.emailLabel')} value={created.email} />
          <CredRow label={t('admin.newVendor.passwordLabel')} value={created.password} />
        </View>
        <Text style={{ fontSize: 11, color: '#B0B4BF', marginTop: 10 }}>
          {t('admin.newVendor.credentialsNote')}
        </Text>

        <Tap
          onPress={reset}
          style={{
            backgroundColor: Brand.adminAccent, borderRadius: 50, paddingVertical: 14,
            alignItems: 'center', marginTop: 20,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{t('admin.newVendor.createAnother')}</Text>
        </Tap>
      </View>
    );
  }

  return (
    <View>
      <Text style={{ fontSize: 22, fontWeight: '800', color: Brand.textPrimary, marginBottom: 4 }}>
        {t('admin.newVendor.title')}
      </Text>
      <Text style={{ fontSize: 14, color: Brand.textSecondary, marginBottom: 24 }}>
        {t('admin.newVendor.subtitle')}
      </Text>

      <Field label={t('admin.newVendor.emailLabel')}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('admin.newVendor.emailPlaceholder')}
          placeholderTextColor="#B0B4BF"
          autoCapitalize="none"
          keyboardType="email-address"
          style={inputStyle}
        />
      </Field>

      <Field label={t('admin.newVendor.passwordLabel')}>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={t('admin.newVendor.passwordPlaceholder')}
          placeholderTextColor="#B0B4BF"
          autoCapitalize="none"
          autoCorrect={false}
          style={inputStyle}
        />
      </Field>

      <Field label={t('admin.newVendor.businessNameLabel')}>
        <TextInput
          value={businessName}
          onChangeText={setBusinessName}
          placeholder={t('admin.newVendor.businessNamePlaceholder')}
          placeholderTextColor="#B0B4BF"
          style={inputStyle}
        />
      </Field>

      <Field label={t('admin.newVendor.cuisineTagsLabel')}>
        <TextInput
          value={cuisineTags}
          onChangeText={setCuisineTags}
          placeholder={t('admin.newVendor.cuisineTagsPlaceholder')}
          placeholderTextColor="#B0B4BF"
          style={inputStyle}
        />
        <Text style={{ fontSize: 11, color: '#8A8F9B', marginTop: 4 }}>{t('admin.newVendor.cuisineTagsHint')}</Text>
      </Field>

      <Tap
        onPress={handleSubmit}
        disabled={!canSubmit}
        style={{
          backgroundColor: Brand.adminAccent, borderRadius: 50, paddingVertical: 14,
          alignItems: 'center', opacity: canSubmit ? 1 : 0.5, marginTop: 8,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
          {submitting ? t('admin.newVendor.submitting') : t('admin.newVendor.submit')}
        </Text>
      </Tap>
    </View>
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

function CredRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.6, marginBottom: 2 }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ fontSize: 15, color: Brand.textPrimary, fontWeight: '600' }} selectable>
        {value}
      </Text>
    </View>
  );
}

const inputStyle = {
  borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10,
  paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Brand.textPrimary, backgroundColor: '#fff',
} as const;
