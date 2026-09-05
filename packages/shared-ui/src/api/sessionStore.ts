import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Where the auth token lives between launches.
 *
 * On iOS and Android this is expo-secure-store — Keychain / EncryptedSharedPreferences.
 *
 * On web there is no secure store at all (expo-secure-store's web build is an
 * empty module), so we fall back to localStorage. That is deliberately weaker:
 * anything running in the page can read it. The web target here is a preview
 * surface for reviewing the UI, not a shipping product, and the token it holds
 * is the same short-lived JWT the API issues. If web ever becomes a real
 * channel, this should move to an httpOnly cookie issued by the API instead.
 */

const isWeb = Platform.OS === 'web';

function webStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Safari in private mode throws on the property access itself.
    return null;
  }
}

export async function readToken(key: string): Promise<string | null> {
  try {
    if (isWeb) return webStorage()?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function writeToken(key: string, token: string): Promise<void> {
  try {
    if (isWeb) {
      webStorage()?.setItem(key, token);
      return;
    }
    await SecureStore.setItemAsync(key, token);
  } catch (error) {
    // A device without a secure enclave, or a browser with storage blocked.
    // The session still works for this launch; it just will not survive one.
    console.warn('[api] could not persist session token:', (error as Error).message);
  }
}

export async function clearToken(key: string): Promise<void> {
  try {
    if (isWeb) {
      webStorage()?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Nothing to do — the in-memory session is cleared by the caller regardless.
  }
}
