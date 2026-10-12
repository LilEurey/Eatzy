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

/**
 * Walking directions to a point in the platform's own maps app: Apple Maps on
 * iOS, Google Maps everywhere else. Both are https universal links, so they
 * open the app when installed and the browser otherwise — no `canOpenURL` /
 * manifest `<queries>` needed.
 */
export function directionsUrl(c: LatLng, os: string): string {
  const dest = `${c.latitude},${c.longitude}`;
  return os === 'ios'
    ? `https://maps.apple.com/?daddr=${dest}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=walking`;
}
