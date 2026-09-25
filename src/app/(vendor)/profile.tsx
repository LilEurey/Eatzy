import { useState } from 'react';
import { View, Text, TextInput, Switch } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import { Tap } from '@/components/Tap';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { PillDropdown } from '@/components/PillDropdown';
import { useVendorProfile, updateVendorProfile, startVendorStripeOnboarding, refreshVendorProfile } from '@/lib/vendor-store';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';
import { hasCoords } from '@/lib/geo';

const INPUT_STYLE = { borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Brand.textPrimary } as const;
const MULTILINE_STYLE = { minHeight: 70, textAlignVertical: 'top' } as const;

// Every 30 min; the stored value is kept as an option if it sits off that grid.
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

function TimeField({ label, value, onChange, notSetLabel }: { label: string; value: string; onChange: (v: string) => void; notSetLabel: string }) {
  const times = value && !HALF_HOURS.includes(value) ? [value, ...HALF_HOURS] : HALF_HOURS;
  return (
    <View>
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{label}</Text>
      <PillDropdown
        icon="time-outline"
        label={value || notSetLabel}
        selected={value}
        onSelect={onChange}
        options={[{ key: '', label: notSetLabel }, ...times.map(t => ({ key: t, label: t }))]}
      />
    </View>
  );
}

function Field({ label, hint, ...inputProps }: { label: string; hint?: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View>
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{label}</Text>
      <TextInput placeholderTextColor="#B0B4BF" {...inputProps} style={[INPUT_STYLE, inputProps.style]} />
      {hint && <Text style={{ fontSize: 11, color: '#8A8F9B', marginTop: 4 }}>{hint}</Text>}
    </View>
  );
}

export default function VendorProfileScreen() {
  const { t } = useI18n();
  const vendor = useVendorProfile();
  const [connectingPayouts, setConnectingPayouts] = useState(false);

  async function setUpPayouts() {
    setConnectingPayouts(true);
    const redirectTo = ExpoLinking.createURL('/');
    const url = await startVendorStripeOnboarding(redirectTo);
    if (url) {
      await WebBrowser.openAuthSessionAsync(url, redirectTo);
      await refreshVendorProfile();
    }
    setConnectingPayouts(false);
  }

  const [name, setName] = useState(vendor?.name ?? '');
  const [isOnCampus, setIsOnCampus] = useState(vendor?.is_on_campus ?? true);
  const [stallNumber, setStallNumber] = useState(vendor?.stall_number ?? '');
  const [address, setAddress] = useState(vendor?.address ?? '');
  const [bio, setBio] = useState(vendor?.bio ?? '');
  const [bioTh, setBioTh] = useState(vendor?.bio_th ?? '');
  const [cuisineTags, setCuisineTags] = useState((vendor?.cuisine_tags ?? []).join(', '));
  const [halalCertified, setHalalCertified] = useState(vendor?.is_halal_certified ?? false);
  const [openTime, setOpenTime] = useState(vendor?.open_time?.slice(0, 5) ?? '');
  const [closeTime, setCloseTime] = useState(vendor?.close_time?.slice(0, 5) ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const ok = await updateVendorProfile({
      name: name.trim(),
      is_on_campus: isOnCampus,
      stall_number: isOnCampus ? stallNumber.trim() || null : null,
      address: isOnCampus ? null : address.trim() || null,
      bio: bio.trim() || null,
      bio_th: bioTh.trim() || null,
      cuisine_tags: cuisineTags.split(',').map(tag => tag.trim()).filter(Boolean),
      is_halal_certified: halalCertified,
      open_time: openTime || null,
      close_time: closeTime || null,
    });
    setSaving(false);
    if (ok) showAlert(t('vendor.profile.savedTitle'), t('vendor.profile.savedMsg'), () => router.back());
  }

  return (
    <View style={{ gap: 20 }}>
      <View>
        <Text style={{ fontSize: 22, fontWeight: '800', color: Brand.textPrimary }}>{t('vendor.profile.title')}</Text>
        <Tap onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <Ionicons name="arrow-back" size={14} color="#8A8F9B" />
          <Text style={{ fontSize: 13, color: '#8A8F9B' }}>{t('vendor.profile.backCaption')}</Text>
        </Tap>
      </View>

      <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#EEF0F5', gap: 10, maxWidth: 480 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>{t('vendor.profile.payoutsTitle')}</Text>
        <Text style={{ fontSize: 13, color: '#8A8F9B' }}>
          {vendor?.stripe_payouts_enabled
            ? t('vendor.profile.payoutsActive')
            : vendor?.stripe_account_id
              ? t('vendor.profile.payoutsPending')
              : t('vendor.profile.payoutsNotStarted')}
        </Text>
        <Tap
          onPress={setUpPayouts}
          disabled={connectingPayouts}
          style={{ alignSelf: 'flex-start', backgroundColor: Brand.vendorAccent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, opacity: connectingPayouts ? 0.7 : 1 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>
            {connectingPayouts
              ? t('vendor.profile.payoutsConnecting')
              : vendor?.stripe_account_id
                ? t('vendor.profile.payoutsResume')
                : t('vendor.profile.payoutsSetUp')}
          </Text>
        </Tap>
      </View>

      <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#EEF0F5', gap: 14, maxWidth: 480 }}>
        <Field label={t('vendor.profile.nameLabel')} value={name} onChangeText={setName} />

        <View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{t('vendor.profile.locationTypeLabel')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([
              { value: true, label: t('vendor.profile.onCampusOption') },
              { value: false, label: t('vendor.profile.offCampusOption') },
            ] as const).map(option => {
              const selected = isOnCampus === option.value;
              return (
                <Tap
                  key={String(option.value)}
                  onPress={() => setIsOnCampus(option.value)}
                  style={{
                    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
                    backgroundColor: selected ? Brand.vendorAccent : '#fff',
                    borderWidth: 1, borderColor: selected ? Brand.vendorAccent : '#E2E4EC',
                  }}
                >
                  <Text style={{ color: selected ? '#fff' : Brand.textPrimary, fontWeight: '600', fontSize: 13 }}>
                    {option.label}
                  </Text>
                </Tap>
              );
            })}
          </View>
        </View>

        {isOnCampus ? (
          <Field label={t('vendor.profile.stallNumberLabel')} value={stallNumber} onChangeText={setStallNumber} />
        ) : (
          <Field label={t('vendor.profile.addressLabel')} value={address} onChangeText={setAddress} />
        )}

        <Tap
          onPress={() => router.push('/(vendor)/profile/location')}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary }}>{t('vendor.location.rowLabel')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 13, color: '#8A8F9B' }}>
              {vendor && hasCoords(vendor) ? t('vendor.location.pinned') : t('vendor.location.notSet')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#8A8F9B" />
          </View>
        </Tap>

        <Field label={t('vendor.profile.bioLabel')} value={bio} onChangeText={setBio} placeholder={t('vendor.profile.bioPlaceholder')} multiline numberOfLines={3} style={MULTILINE_STYLE} />

        <Field label={t('vendor.profile.bioThLabel')} value={bioTh} onChangeText={setBioTh} placeholder={t('vendor.profile.bioThPlaceholder')} multiline numberOfLines={3} style={MULTILINE_STYLE} />

        <Field label={t('vendor.profile.cuisineTagsLabel')} value={cuisineTags} onChangeText={setCuisineTags} placeholder={t('vendor.profile.cuisineTagsPlaceholder')} hint={t('vendor.profile.cuisineTagsHint')} />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TimeField label={t('vendor.profile.openTimeLabel')} value={openTime} onChange={setOpenTime} notSetLabel={t('vendor.profile.timeNotSet')} />
          </View>
          <View style={{ flex: 1 }}>
            <TimeField label={t('vendor.profile.closeTimeLabel')} value={closeTime} onChange={setCloseTime} notSetLabel={t('vendor.profile.timeNotSet')} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary }}>{t('vendor.profile.halalCertifiedLabel')}</Text>
          <Switch
            value={halalCertified}
            onValueChange={setHalalCertified}
            trackColor={{ false: '#E2E4EC', true: Brand.vendorAccent }}
          />
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
        <Tap onPress={() => router.back()} style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary }}>{t('vendor.profile.cancel')}</Text>
        </Tap>
        <Tap onPress={save} disabled={saving} style={{ backgroundColor: Brand.orange, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11, opacity: saving ? 0.7 : 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{saving ? t('vendor.profile.saving') : t('vendor.profile.save')}</Text>
        </Tap>
      </View>
    </View>
  );
}
