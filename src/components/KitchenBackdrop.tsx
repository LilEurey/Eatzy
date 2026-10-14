import Svg, { Rect, Circle, Line, Path, G } from 'react-native-svg';

// Flat one-tone kitchen silhouette (peach on brand orangeLight) that sits
// behind the track screen's stage animation.
const WALL = '#FFF0E8';
const INK = '#F7CDB3';
const COUNTER = '#FADCC8';
const COUNTER_EDGE = '#F3C2A3';

export function KitchenBackdrop() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 340 170" preserveAspectRatio="xMidYMax slice">
      <Rect width="340" height="170" fill={WALL} />

      {/* Left: shelf with spice jars and a little plant */}
      <Rect x="14" y="70" width="88" height="5" rx="2" fill={INK} />
      <G fill={INK}>
        <Rect x="20" y="48" width="16" height="22" rx="4" />
        <Rect x="18" y="44" width="20" height="6" rx="2" />
        <Rect x="42" y="54" width="14" height="16" rx="4" />
        <Rect x="40" y="50" width="18" height="5" rx="2" />
        <Path d="M66 70 h16 l-2 -14 h-12 z" />
        <Path d="M74 56 c-8 -4 -10 -12 -6 -18 c4 4 6 10 6 18 c0 -8 3 -16 9 -18 c2 8 -2 14 -9 18 z" />
      </G>

      {/* Right: wall clock + pendant lamp */}
      <Circle cx="300" cy="46" r="15" fill="none" stroke={INK} strokeWidth="4" />
      <Line x1="300" y1="46" x2="300" y2="37" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <Line x1="300" y1="46" x2="307" y2="49" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <Line x1="250" y1="0" x2="250" y2="30" stroke={INK} strokeWidth="2" />
      <Path d="M236 44 a14 14 0 0 1 28 0 z" fill={INK} />

      {/* Counter */}
      <Rect x="0" y="136" width="340" height="34" fill={COUNTER} />
      <Rect x="0" y="136" width="340" height="5" fill={COUNTER_EDGE} />
    </Svg>
  );
}
