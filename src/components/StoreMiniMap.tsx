import { useMemo } from 'react';
import { View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { regionForCoords } from '@/lib/geo';

type Props = {
  latitude: number;
  longitude: number;
  title: string;
  showUser: boolean;
};

/**
 * Student-facing read-only mini map. Native only — the `.web.tsx` sibling
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

  return (
    <View style={{ height: 160, borderRadius: 16, overflow: 'hidden' }}>
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
      >
        <Marker coordinate={{ latitude, longitude }} title={title} />
      </MapView>
    </View>
  );
}
