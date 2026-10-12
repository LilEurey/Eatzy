import { KMUTT_REGION, directionsUrl, hasCoords, regionForCoords } from '@/lib/geo';

describe('hasCoords', () => {
  it('is true when both coordinates are finite numbers', () => {
    expect(hasCoords({ latitude: 13.65, longitude: 100.49 })).toBe(true);
  });
  it('is false when either coordinate is null', () => {
    expect(hasCoords({ latitude: 13.65, longitude: null })).toBe(false);
    expect(hasCoords({ latitude: null, longitude: 100.49 })).toBe(false);
    expect(hasCoords({ latitude: null, longitude: null })).toBe(false);
  });
  it('is false for NaN', () => {
    expect(hasCoords({ latitude: NaN, longitude: 100.49 })).toBe(false);
  });
});

describe('regionForCoords', () => {
  it('wraps a point in a tight default region', () => {
    expect(regionForCoords({ latitude: 13.65, longitude: 100.49 })).toEqual({
      latitude: 13.65,
      longitude: 100.49,
      latitudeDelta: 0.003,
      longitudeDelta: 0.003,
    });
  });
  it('honours a custom delta', () => {
    const r = regionForCoords({ latitude: 1, longitude: 2 }, 0.05);
    expect(r.latitudeDelta).toBe(0.05);
    expect(r.longitudeDelta).toBe(0.05);
  });
});

describe('KMUTT_REGION', () => {
  it('is centered on the Bang Mod campus with a campus-wide zoom', () => {
    expect(KMUTT_REGION.latitude).toBeCloseTo(13.6512, 3);
    expect(KMUTT_REGION.longitude).toBeCloseTo(100.4967, 3);
    expect(KMUTT_REGION.latitudeDelta).toBeGreaterThan(0);
  });
});

describe('directionsUrl', () => {
  const c = { latitude: 13.65, longitude: 100.49 };
  it('opens Apple Maps on iOS, Google Maps elsewhere', () => {
    expect(directionsUrl(c, 'ios')).toBe('https://maps.apple.com/?daddr=13.65,100.49&dirflg=d');
    expect(directionsUrl(c, 'android')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=13.65,100.49&travelmode=driving',
    );
  });
});
