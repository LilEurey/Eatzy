import { useCallback, useState } from 'react';
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
  const control = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setRefreshing(true);
        setKey(k => k + 1);
      }}
      tintColor={Brand.orange}
      colors={[Brand.orange]}
    />
  );
  return { key, done, control };
}
