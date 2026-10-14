import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from 'expo-router';
import { RefreshControl } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Brand } from '@/constants/theme';

// Pull-to-refresh for screens whose load already lives in a focus effect:
// add `key` to that effect's deps so a pull re-runs it, call `done()` wherever
// the load settles (success or failure), and pass `control` to the ScrollView.
// A load cancelled by blur leaves the spinner up; the next focus load clears it.
export function usePullToRefresh() {
  const [key, setKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const done = useCallback(() => setRefreshing(false), []);
  const refresh = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    setKey(k => k + 1);
  }, []);
  const control = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={refresh}
      tintColor={Brand.orange}
      colors={[Brand.orange]}
    />
  );
  return { key, done, control, refresh };
}

// Re-tapping the tab you're already on calls `refresh` (Instagram-style).
// tabPress fires before the tab switch, so isFocused() is only true on a re-tap;
// switching in from another tab is left to the screen's focus load.
export function useRefreshOnTabRetap(refresh: () => void) {
  const navigation = useNavigation();
  useEffect(
    () => navigation.addListener('tabPress' as never, () => {
      if (navigation.isFocused()) refresh();
    }),
    [navigation, refresh],
  );
}
