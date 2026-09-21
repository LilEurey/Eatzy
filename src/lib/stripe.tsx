import type { ComponentProps } from 'react';
import type * as StripeSdk from '@stripe/stripe-react-native';

// The SDK throws at import time ("'StripeSdk' could not be found") when the
// running binary lacks its native module — Expo Go, or a dev build made before
// the plugin was added. Load it guarded so unrelated screens still render; the
// top-up flow then reports a normal error instead of crashing the whole app.
let sdk: typeof StripeSdk | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate: a static/dynamic import() would throw (or go async) when the native module is missing; require() inside try/catch is the guard
  sdk = require('@stripe/stripe-react-native');
} catch {
  sdk = null;
}

const unavailable = {
  error: { code: 'Failed', message: 'Payments need a development build (npx expo run:ios), not Expo Go.' },
};

// CollectionMode.NEVER's value, without a runtime import of the guarded SDK.
export const COLLECT_NEVER = 'never' as StripeSdk.CollectionMode;

export function StripeProvider(props: ComponentProps<typeof StripeSdk.StripeProvider>) {
  if (!sdk) return <>{props.children}</>;
  return <sdk.StripeProvider {...props} />;
}

export function useStripe() {
  if (sdk) return sdk.useStripe();
  return {
    initPaymentSheet: async () => unavailable,
    presentPaymentSheet: async () => unavailable,
  };
}
