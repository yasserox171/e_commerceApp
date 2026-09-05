import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Where the app talks to @ecommerce/api.
 *
 * `EXPO_PUBLIC_API_URL` is inlined by Metro at build time and is what EAS
 * builds use. In `expo start` without a .env we fall back to the machine
 * running the dev server, so a fresh clone runs against a local API with no
 * configuration at all.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  // hostUri looks like "192.168.1.20:8081" — the LAN address Metro is serving
  // from, which is also the address a physical device can reach the API on.
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:4000`;

  // 10.0.2.2 is how the Android emulator addresses its host machine.
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export const API_URL = resolveApiUrl();

export const APP = {
  name: '9ri3a',
  tagline: 'الجملة بأسعار المصدر',
  channel: 'wholesale',
  variant: 'wholesale',
  supportEmail: 'contact@qri3a.ma',
} as const;
