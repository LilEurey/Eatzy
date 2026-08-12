import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'eatzy.postAuthVendorIntent';
const TTL_MS = 10 * 60 * 1000;

export async function setVendorIntent(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, String(Date.now()));
}

export async function clearVendorIntent(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

// Read-and-clear so a flag is honored at most once, on whichever
// session-change event consumes it next — bounded by a TTL so an
// abandoned OAuth attempt can't misroute a later, unrelated login.
export async function consumeVendorIntent(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) await AsyncStorage.removeItem(STORAGE_KEY);
  if (!raw) return false;
  return Date.now() - Number(raw) <= TTL_MS;
}
