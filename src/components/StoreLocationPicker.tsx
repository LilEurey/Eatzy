import { View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import type { Region } from 'react-native-maps';
import { setScrollLocked } from '@/lib/scroll-lock';
import type { LatLng } from '@/lib/geo';

type Props = {
  point: LatLng | null;
  initialRegion: Region;
  onPick: (c: LatLng) => void;
  mapRef: React.RefObject<MapView | null>;
};

/**
 * Vendor-facing interactive map surface for placing a store pin. Native only —
 * the `.web.tsx` sibling renders nothing so `react-native-maps` never enters
 * the web module graph. The picker screen shows its own web-only message.
 *
 * While a finger is on the map we freeze the parent layout ScrollView
 * (`(vendor)/_layout.tsx`) so a vertical drag isn't stolen from the map.
 */
export default function StoreLocationPicker({ point, initialRegion, onPick, mapRef }: Props) {
  return (
    <View
      onTouchStart={() => setScrollLocked(true)}
      onTouchEnd={() => setScrollLocked(false)}
      onTouchCancel={() => setScrollLocked(false)}
      style={{ height: 440, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#EEF0F5', maxWidth: 480 }}
    >
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        onPress={e => onPick(e.nativeEvent.coordinate)}
      >
        {point && (
          <Marker draggable coordinate={point} onDragEnd={e => onPick(e.nativeEvent.coordinate)} />
        )}
      </MapView>
    </View>
  );
}
