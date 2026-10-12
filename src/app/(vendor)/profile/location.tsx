import { useEffect, useRef, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import type MapView from 'react-native-maps';
import * as Location from 'expo-location';
import { Tap } from '@/components/Tap';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import StoreLocationPicker from '@/components/StoreLocationPicker';
import { useVendorProfile, updateVendorProfile } from '@/lib/vendor-store';
import { useI18n } from '@/lib/i18n';
import { setScrollLocked } from '@/lib/scroll-lock';
import { KMUTT_REGION, regionForCoords, hasCoords, type LatLng } from '@/lib/geo';

export default function VendorStoreLocationScreen() {
  const { t } = useI18n();
  const vendor = useVendorProfile();

  const [point, setPoint] = useState<LatLng | null>(() =>
    vendor && hasCoords(vendor) ? { latitude: vendor.latitude, longitude: vendor.longitude } : null,
  );
  const [permDenied, setPermDenied] = useState(false);
  const [saving, setSaving] = useState(false);
  const mapRef = useRef<MapView>(null);

  // Belt-and-braces: if the screen unmounts mid-drag, don't leave the parent
  // layout ScrollView frozen.
  useEffect(() => () => setScrollLocked(false), []);

  // react-native-maps has no web implementation — never mount MapView on web.
  if (Platform.OS === 'web') {
    return (
      <View style={{ padding: 24, maxWidth: 480 }}>
        <Text style={{ fontSize: 14, color: Brand.textPrimary }}>{t('vendor.location.webOnly')}</Text>
      </View>
    );
  }

  async function useMyLocation() {
    // getCurrentPositionAsync / requestForegroundPermissions can reject on
    // Location-Services-off (system-wide, distinct from a denied permission),
    // a GPS timeout indoors, or a simulator with no location set. Fall back to
    // the "tap the map to place your pin" guidance rather than a redbox.
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermDenied(true);
        return;
      }
      setPermDenied(false);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next: LatLng = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setPoint(next);
      mapRef.current?.animateToRegion(regionForCoords(next), 400);
    } catch {
      setPermDenied(true);
    }
  }

  async function onSave() {
    if (!point) return;
    setSaving(true);
    const ok = await updateVendorProfile({ latitude: point.latitude, longitude: point.longitude });
    setSaving(false);
    if (ok) router.back();
  }

  const saveDisabled = point == null || saving;

  return (
    <View style={{ gap: 16 }}>
      <View>
        <Text style={{ fontSize: 22, fontWeight: '800', color: Brand.textPrimary }}>{t('vendor.location.rowLabel')}</Text>
        <Tap onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <Ionicons name="arrow-back" size={14} color="#8A8F9B" />
          <Text style={{ fontSize: 13, color: '#8A8F9B' }}>{t('vendor.profile.backCaption')}</Text>
        </Tap>
      </View>

      <Text style={{ fontSize: 13, color: '#4B4F58', maxWidth: 480 }}>{t('vendor.location.hint')}</Text>

      <StoreLocationPicker
        point={point}
        initialRegion={point ? regionForCoords(point) : KMUTT_REGION}
        onPick={setPoint}
        mapRef={mapRef}
      />

      {permDenied && (
        <Text style={{ fontSize: 12, color: Brand.orange, maxWidth: 480 }}>{t('vendor.location.permDenied')}</Text>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, maxWidth: 480 }}>
        <Tap
          onPress={useMyLocation}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
          }}
        >
          <Ionicons name="locate-outline" size={15} color={Brand.textPrimary} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary }}>{t('vendor.location.useMyLocation')}</Text>
        </Tap>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tap onPress={() => router.back()} style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary }}>{t('vendor.profile.cancel')}</Text>
          </Tap>
          <Tap
            onPress={onSave}
            disabled={saveDisabled}
            style={{ backgroundColor: Brand.orange, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11, opacity: saveDisabled ? 0.5 : 1 }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>
              {saving ? t('vendor.profile.saving') : t('vendor.location.save')}
            </Text>
          </Tap>
        </View>
      </View>
    </View>
  );
}
