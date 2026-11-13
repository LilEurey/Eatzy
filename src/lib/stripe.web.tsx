import type { ReactNode } from 'react';
import type * as StripeSdk from '@stripe/stripe-react-native';

// Web stub: the Stripe RN SDK is native-only and breaks the web bundle.
const unavailable = {
  error: { code: 'Failed', message: 'Payments are not available on web.' },
};

export const COLLECT_NEVER = 'never' as StripeSdk.CollectionMode;

export function StripeProvider(props: { children?: ReactNode }) {
  return <>{props.children}</>;
}

export function useStripe() {
  return {
    initPaymentSheet: async () => unavailable,
    presentPaymentSheet: async () => unavailable,
  };
}
