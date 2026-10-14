import Svg, { Rect, Circle, Line, Path, G } from 'react-native-svg';

// Flat two-tone kitchen silhouette (peach on brand orangeLight) that sits
// behind the track screen's stage animation. viewBox matches the 200px-tall
// header; the pan in the GIF lands on the counter top (y=160).
const WALL = '#FFF0E8';
const TILE = '#FBE2D3';
const INK = '#F7CDB3';
const DEEP = '#F0B998';

export function KitchenBackdrop() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 340 200" preserveAspectRatio="xMidYMax slice">
      <Rect width="340" height="200" fill={WALL} />

      {/* Tiled backsplash */}
      <Rect x="0" y="96" width="340" height="64" fill={TILE} />
      <G stroke={WALL} strokeWidth="1.5">
        {[112, 128, 144].map(y => <Line key={y} x1="0" y1={y} x2="340" y2={y} />)}
        {Array.from({ length: 22 }, (_, i) => i * 16).map(x => <Line key={x} x1={x} y1="96" x2={x} y2="160" />)}
      </G>

      {/* Upper cabinets */}
      <G fill={INK}>
        <Rect x="8" y="0" width="104" height="52" rx="4" />
        <Rect x="228" y="0" width="104" height="52" rx="4" />
      </G>
      <G stroke={WALL} strokeWidth="2">
        <Line x1="60" y1="0" x2="60" y2="52" />
        <Line x1="280" y1="0" x2="280" y2="52" />
      </G>
      <G fill={DEEP}>
        <Rect x="52" y="38" width="3" height="10" rx="1.5" />
        <Rect x="65" y="38" width="3" height="10" rx="1.5" />
        <Rect x="272" y="38" width="3" height="10" rx="1.5" />
        <Rect x="285" y="38" width="3" height="10" rx="1.5" />
      </G>

      {/* Range hood — kept above y=36 so the GIF's tossed veggies (peak ~y=41) clear it */}
      <Rect x="154" y="0" width="32" height="14" fill={INK} />
      <Path d="M154 14 h32 l22 18 h-76 z" fill={INK} />
      <Rect x="130" y="32" width="80" height="4" rx="2" fill={DEEP} />

      {/* Mugs on hooks under the right cabinet */}
      <Line x1="244" y1="64" x2="316" y2="64" stroke={DEEP} strokeWidth="2.5" strokeLinecap="round" />
      <G fill={INK}>
        <Rect x="250" y="70" width="14" height="14" rx="3" />
        <Rect x="276" y="70" width="14" height="14" rx="3" />
        <Rect x="302" y="70" width="14" height="14" rx="3" />
      </G>
      <G stroke={INK} strokeWidth="2.5" fill="none">
        <Circle cx="266" cy="77" r="4" />
        <Circle cx="292" cy="77" r="4" />
        <Circle cx="318" cy="77" r="4" />
        <Line x1="257" y1="64" x2="257" y2="70" />
        <Line x1="283" y1="64" x2="283" y2="70" />
        <Line x1="309" y1="64" x2="309" y2="70" />
      </G>

      {/* Jars + plant on the counter */}
      <G fill={INK}>
        <Rect x="20" y="132" width="16" height="28" rx="4" />
        <Rect x="18" y="127" width="20" height="6" rx="2" />
        <Rect x="42" y="140" width="14" height="20" rx="4" />
        <Rect x="40" y="136" width="18" height="5" rx="2" />
        <Path d="M300 160 h18 l-2 -16 h-14 z" />
        <Path d="M309 144 c-9 -4 -11 -13 -7 -20 c5 5 7 11 7 20 c0 -9 3 -18 10 -20 c2 9 -2 16 -10 20 z" />
      </G>

      {/* Counter + lower cabinets */}
      <Rect x="0" y="160" width="340" height="7" fill={DEEP} />
      <Rect x="0" y="167" width="340" height="33" fill={INK} />
      <G stroke={WALL} strokeWidth="2">
        {[68, 136, 204, 272].map(x => <Line key={x} x1={x} y1="167" x2={x} y2="200" />)}
      </G>
      {/* Stove: cooktop the pan sits on, oven door + knobs below */}
      <Rect x="118" y="155" width="104" height="6" rx="2" fill={DEEP} />
      <Rect x="142" y="184" width="56" height="12" rx="3" fill={WALL} opacity={0.6} />
      <G fill={DEEP}>
        {[156, 170, 184].map(x => <Circle key={x} cx={x} cy="175" r="3" />)}
      </G>
      <G fill={DEEP}>
        {[58, 78, 262, 282].map(x => <Circle key={x} cx={x} cy="176" r="2.5" />)}
      </G>
    </Svg>
  );
}

// Classroom variant for the "order placed" stage — a student pre-ordering
// from lecture. Same palette/viewBox; the phone in placed.gif covers the
// board's middle, so the board's chalk marks sit at its edges.
export function ClassroomBackdrop() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 340 200" preserveAspectRatio="xMidYMax slice">
      <Rect width="340" height="200" fill={WALL} />

      {/* Clock */}
      <Circle cx="34" cy="34" r="15" fill={INK} />
      <G stroke={DEEP} strokeWidth="2.5" strokeLinecap="round">
        <Line x1="34" y1="34" x2="34" y2="25" />
        <Line x1="34" y1="34" x2="41" y2="37" />
      </G>

      {/* Chalkboard + tray, scribbles at the edges */}
      <Rect x="68" y="18" width="204" height="94" rx="4" fill={INK} stroke={DEEP} strokeWidth="3" />
      <Rect x="62" y="112" width="216" height="5" rx="2" fill={DEEP} />
      <G stroke={WALL} strokeWidth="2" strokeLinecap="round" fill="none">
        <Line x1="80" y1="34" x2="112" y2="34" />
        <Line x1="80" y1="46" x2="104" y2="46" />
        <Line x1="80" y1="58" x2="116" y2="58" />
        <Path d="M80 92 q12 -24 24 -6 t22 -10" />
        <Circle cx="248" cy="44" r="11" />
        <Line x1="236" y1="72" x2="262" y2="72" />
        <Line x1="236" y1="84" x2="254" y2="84" />
      </G>

      {/* Window */}
      <Rect x="290" y="20" width="40" height="72" rx="3" fill={INK} />
      <G stroke={WALL} strokeWidth="2.5">
        <Line x1="310" y1="20" x2="310" y2="92" />
        <Line x1="290" y1="56" x2="330" y2="56" />
      </G>

      {/* Books + laptop on the desk */}
      <G fill={INK}>
        <Rect x="16" y="140" width="10" height="20" rx="1.5" />
        <Rect x="28" y="134" width="9" height="26" rx="1.5" />
        <Rect x="39" y="144" width="12" height="16" rx="1.5" />
        <Rect x="286" y="130" width="36" height="26" rx="3" />
        <Rect x="280" y="156" width="48" height="4" rx="2" />
      </G>
      <Circle cx="304" cy="143" r="3" fill={WALL} />

      {/* Desk row */}
      <Rect x="0" y="160" width="340" height="7" fill={DEEP} />
      <Rect x="0" y="167" width="340" height="33" fill={INK} />
      <G stroke={WALL} strokeWidth="2">
        {[85, 170, 255].map(x => <Line key={x} x1={x} y1="167" x2={x} y2="200" />)}
      </G>
    </Svg>
  );
}
