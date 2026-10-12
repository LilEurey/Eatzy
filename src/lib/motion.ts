import { FadeInDown } from 'react-native-reanimated';

// Staggered list entrance shared by every list screen. Delay caps at the 8th
// row so long lists don't make the user wait for the bottom to appear.
export const listEnter = (index: number) =>
  FadeInDown.delay(Math.min(index, 8) * 40).springify().damping(18);
