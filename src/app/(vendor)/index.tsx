import { Redirect } from 'expo-router';

export default function VendorIndex() {
  return <Redirect href={"/(vendor)/overview" as any} />;
}
