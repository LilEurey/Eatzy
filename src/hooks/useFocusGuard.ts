import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

export function useFocusGuard() {
  const cancelledRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      cancelledRef.current = false;
      return () => { cancelledRef.current = true; };
    }, [])
  );
  return cancelledRef;
}
