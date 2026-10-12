import { useMemo } from 'react';
import { View, Text, Linking, Platform } from 'react-native';
import MapView, { PROVIDER_DEFAULT } from 'react-native-maps';
import { Tap } from '@/components/Tap';
import { directionsUrl, regionForCoords } from '@/lib/geo';
import { useI18n } from '@/lib/i18n';
import { Brand } from '@/constants/theme';

type Props = {
  latitude: number;
  longitude: number;
  title: string;
  showUser: boolean;
};

/**
 * Student-facing read-only mini map; tapping it opens walking directions in
 * Apple Maps (iOS) / Google Maps (Android). Native only — the `.web.tsx` sibling
 * renders nothing so `react-native-maps` never enters the web module graph
 * (its `lib/index.js` eagerly pulls RN internals the web resolver blocks).
 */
export default function StoreMiniMap({ latitude, longitude, title, showUser }: Props) {
  // MapView spreads `region` onto the native view every render — memo keeps
  // the object identity stable so it doesn't thrash on unrelated re-renders.
  const region = useMemo(
    () => regionForCoords({ latitude, longitude }),
    [latitude, longitude],
  );

  const { t } = useI18n();

  return (
    <Tap
      accessibilityRole="link"
      accessibilityLabel={`${title} — ${t('store.openInMaps')}`}
      onPress={() => {
        Linking.openURL(directionsUrl({ latitude, longitude }, Platform.OS)).catch(() => {});
      }}
      style={{ height: 160, borderRadius: 16, overflow: 'hidden' }}
    >
      <MapView
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        pointerEvents="none"
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        showsUserLocation={showUser}
        region={region}
      />
      {/* Pin is an overlay, not a <Marker> child: Marker children crash Android
          Fabric ("addViewAt: failed"). Region is centered on the stall, so the
          center of the map is the stall. */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontSize: 32, marginBottom: 32 }}>📍</Text>
      </View>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', right: 8, bottom: 8, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}
      >
        <Text style={{ fontSize: 12, fontWeight: '700', color: Brand.textPrimary }}>{t('store.openInMaps')} ↗</Text>
      </View>
    </Tap>
  );
}
