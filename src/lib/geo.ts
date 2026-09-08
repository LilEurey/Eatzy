import type { Region } from 'react-native-maps';

export type LatLng = { latitude: number; longitude: number };

/** KMUTT Bang Mod campus center — fallback view when a vendor has no pin yet. */
export const KMUTT_REGION: Region = {
  latitude: 13.6512,
  longitude: 100.4967,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

/** Narrow a maybe-empty row to a concrete point. */
export function hasCoords(v: {
  latitude: number | null;
  longitude: number | null;
}): v is LatLng {
  return (
    typeof v.latitude === 'number' &&
    Number.isFinite(v.latitude) &&
    typeof v.longitude === 'number' &&
    Number.isFinite(v.longitude)
  );
}

/** Wrap a single point in a tight (single-stall) map region. */
export function regionForCoords(c: LatLng, delta = 0.003): Region {
  return { latitude: c.latitude, longitude: c.longitude, latitudeDelta: delta, longitudeDelta: delta };
}
