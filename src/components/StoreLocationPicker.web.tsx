// `react-native-maps` has no web build and pulls RN internals the web bundler
// rejects. The picker screen (`(vendor)/profile/location.tsx`) already returns
// a `vendor.location.webOnly` message on web and never renders this component
// there; this stub keeps the module graph clean regardless.
export default function StoreLocationPicker() {
  return null;
}
