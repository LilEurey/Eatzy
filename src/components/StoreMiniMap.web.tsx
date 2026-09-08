// Web has no `react-native-maps` — importing it eagerly pulls RN internals the
// web bundler rejects, which breaks the whole Expo Router web bundle. The
// student store screen already gates this section behind `Platform.OS !== 'web'`;
// this stub is belt-and-braces so the module graph stays clean on web.
export default function StoreMiniMap() {
  return null;
}
