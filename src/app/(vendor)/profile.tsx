import { useState } from 'react';
import { View, Text, TextInput, Switch } from 'react-native';
import { Tap } from '@/components/Tap';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { useVendorProfile, updateVendorProfile } from '@/lib/vendor-store';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';

export default function VendorProfileScreen() {
  const { t } = useI18n();
  const vendor = useVendorProfile();

  const [name, setName] = useState(vendor?.name ?? '');
  const [isOnCampus, setIsOnCampus] = useState(vendor?.is_on_campus ?? true);
  const [stallNumber, setStallNumber] = useState(vendor?.stall_number ?? '');
  const [address, setAddress] = useState(vendor?.address ?? '');
  const [bio, setBio] = useState(vendor?.bio ?? '');
  const [bioTh, setBioTh] = useState(vendor?.bio_th ?? '');
  const [cuisineTags, setCuisineTags] = useState((vendor?.cuisine_tags ?? []).join(', '));
  const [halalCertified, setHalalCertified] = useState(vendor?.is_halal_certified ?? false);
  const [openTime, setOpenTime] = useState(vendor?.open_time ?? '');
  const [closeTime, setCloseTime] = useState(vendor?.close_time ?? '');
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
      open_time: openTime.trim() || null,
      close_time: closeTime.trim() || null,
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

      <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#EEF0F5', gap: 14, maxWidth: 480 }}>
        <View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{t('vendor.profile.nameLabel')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholderTextColor="#B0B4BF"
            style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Brand.textPrimary }}
          />
        </View>

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
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{t('vendor.profile.stallNumberLabel')}</Text>
            <TextInput
              value={stallNumber}
              onChangeText={setStallNumber}
              placeholderTextColor="#B0B4BF"
              style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Brand.textPrimary }}
            />
          </View>
        ) : (
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{t('vendor.profile.addressLabel')}</Text>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholderTextColor="#B0B4BF"
              style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Brand.textPrimary }}
            />
          </View>
        )}

        <View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{t('vendor.profile.bioLabel')}</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder={t('vendor.profile.bioPlaceholder')}
            placeholderTextColor="#B0B4BF"
            multiline
            numberOfLines={3}
            style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Brand.textPrimary, minHeight: 70, textAlignVertical: 'top' }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{t('vendor.profile.bioThLabel')}</Text>
          <TextInput
            value={bioTh}
            onChangeText={setBioTh}
            placeholder={t('vendor.profile.bioThPlaceholder')}
            placeholderTextColor="#B0B4BF"
            multiline
            numberOfLines={3}
            style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Brand.textPrimary, minHeight: 70, textAlignVertical: 'top' }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{t('vendor.profile.cuisineTagsLabel')}</Text>
          <TextInput
            value={cuisineTags}
            onChangeText={setCuisineTags}
            placeholder={t('vendor.profile.cuisineTagsPlaceholder')}
            placeholderTextColor="#B0B4BF"
            style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Brand.textPrimary }}
          />
          <Text style={{ fontSize: 11, color: '#8A8F9B', marginTop: 4 }}>{t('vendor.profile.cuisineTagsHint')}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{t('vendor.profile.openTimeLabel')}</Text>
            <TextInput
              value={openTime}
              onChangeText={setOpenTime}
              placeholder={t('vendor.profile.timePlaceholder')}
              placeholderTextColor="#B0B4BF"
              style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Brand.textPrimary }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{t('vendor.profile.closeTimeLabel')}</Text>
            <TextInput
              value={closeTime}
              onChangeText={setCloseTime}
              placeholder={t('vendor.profile.timePlaceholder')}
              placeholderTextColor="#B0B4BF"
              style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Brand.textPrimary }}
            />
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
