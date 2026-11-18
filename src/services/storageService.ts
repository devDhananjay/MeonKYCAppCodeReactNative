import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import {debugPrint} from '../utils/debug';

/**
 * Manages tokens and cookies equivalent to js-cookie in React.
 * Secure items live in the OS keychain/keystore (flutter_secure_storage
 * equivalent); the "has run before" flag lives in AsyncStorage
 * (shared_preferences equivalent).
 *
 * Access/refresh tokens are also mirrored in process memory so a hung or
 * failed Keychain write cannot block get-context / Authorization headers
 * immediately after login (Flutter leaves those writes un-awaited).
 */
const KEY_ACCESS_TOKEN = 'access_token';
const KEY_REFRESH_TOKEN = 'refresh_token';
const KEY_AUTH_SUCCESS = 'auth_success';
const KEY_MESSAGE = 'message';
const KEY_USER_STEP = 'userStep';
const KEY_USER_DATA = 'user_data';
const KEY_HAS_RUN_BEFORE = 'has_run_before';

const SECURE_KEYS = [
  KEY_ACCESS_TOKEN,
  KEY_REFRESH_TOKEN,
  KEY_AUTH_SUCCESS,
  KEY_MESSAGE,
  KEY_USER_STEP,
  KEY_USER_DATA,
];

const SERVICE_PREFIX = 'meon_kyc.';
/** Android Keystore can hang; never block KYC navigation on storage. */
const SECURE_WRITE_TIMEOUT_MS = 2500;

let memoryAccessToken: string | null = null;
let memoryRefreshToken: string | null = null;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function secureRead(key: string): Promise<string | null> {
  try {
    const res = await withTimeout(
      Keychain.getGenericPassword({service: SERVICE_PREFIX + key}),
      SECURE_WRITE_TIMEOUT_MS,
      `secureRead(${key})`,
    );
    if (!res) return null;
    return res.password;
  } catch (e) {
    debugPrint(`[Storage] secureRead failed for ${key}: ${e}`);
    return null;
  }
}

async function secureWrite(key: string, value: string): Promise<void> {
  try {
    // react-native-keychain rejects / hangs on empty password on some Android builds.
    if (value.length === 0) {
      await withTimeout(secureDelete(key), SECURE_WRITE_TIMEOUT_MS, `secureDelete(${key})`);
      return;
    }
    await withTimeout(
      Keychain.setGenericPassword(key, value, {service: SERVICE_PREFIX + key}),
      SECURE_WRITE_TIMEOUT_MS,
      `secureWrite(${key})`,
    );
  } catch (e) {
    debugPrint(`[Storage] secureWrite failed for ${key}: ${e}`);
  }
}

async function secureDelete(key: string): Promise<void> {
  try {
    await Keychain.resetGenericPassword({service: SERVICE_PREFIX + key});
  } catch (_) {
    // ignore
  }
}

async function secureDeleteAll(): Promise<void> {
  for (const k of SECURE_KEYS) {
    await secureDelete(k);
  }
}

function clearMemoryTokens(): void {
  memoryAccessToken = null;
  memoryRefreshToken = null;
}

// Process-lifetime SSO switch:
// - false by default so a fresh / post-logout load uses get-workflow-details
//   and shows the API's first/current step (not auto-SSO resume into mobile_otp).
// - set true only when host app explicitly wants SSO auto-login.
// - set false on explicit logout (skip SSO; use normal get-workflow/get-user flow).
let ssoAutoLoginEnabled = false;

export const StorageService = {
  /**
   * iOS Keychain (and some Android Keystore setups) entries survive app
   * uninstall/reinstall, unlike AsyncStorage. Call this once at app
   * startup, before any other secure-storage read, to detect a genuine
   * fresh install via an AsyncStorage flag (which IS cleared on
   * uninstall) and wipe stale secure-storage data left over from a
   * previous install.
   */
  async resetOnFreshInstall(): Promise<void> {
    const v = await AsyncStorage.getItem(KEY_HAS_RUN_BEFORE);
    if (v !== 'true') {
      clearMemoryTokens();
      await secureDeleteAll();
      await AsyncStorage.setItem(KEY_HAS_RUN_BEFORE, 'true');
    }
  },

  async getAccessToken(): Promise<string | null> {
    if (memoryAccessToken != null && memoryAccessToken.length > 0) {
      return memoryAccessToken;
    }
    const v = await secureRead(KEY_ACCESS_TOKEN);
    if (v != null && v.length > 0) memoryAccessToken = v;
    return v;
  },

  async setAccessToken(token: string): Promise<void> {
    memoryAccessToken = token.length > 0 ? token : null;
    await secureWrite(KEY_ACCESS_TOKEN, token);
  },

  async getRefreshToken(): Promise<string | null> {
    if (memoryRefreshToken != null && memoryRefreshToken.length > 0) {
      return memoryRefreshToken;
    }
    const v = await secureRead(KEY_REFRESH_TOKEN);
    if (v != null && v.length > 0) memoryRefreshToken = v;
    return v;
  },

  async setRefreshToken(token: string): Promise<void> {
    memoryRefreshToken = token.length > 0 ? token : null;
    await secureWrite(KEY_REFRESH_TOKEN, token);
  },

  setAuthSuccess(value: string): Promise<void> {
    return secureWrite(KEY_AUTH_SUCCESS, value);
  },

  setMessage(msg: string): Promise<void> {
    return secureWrite(KEY_MESSAGE, msg);
  },

  setUserStep(step: string): Promise<void> {
    return secureWrite(KEY_USER_STEP, step);
  },

  setUserData(data: string): Promise<void> {
    return secureWrite(KEY_USER_DATA, data);
  },

  async clearAll(): Promise<void> {
    clearMemoryTokens();
    await secureDeleteAll();
    await AsyncStorage.clear();
  },

  async clearAuthTokens(): Promise<void> {
    clearMemoryTokens();
    await secureDelete(KEY_ACCESS_TOKEN);
    await secureDelete(KEY_REFRESH_TOKEN);
    await secureDelete(KEY_AUTH_SUCCESS);
  },

  async hasAccessToken(): Promise<boolean> {
    const token = await StorageService.getAccessToken();
    return token != null && token.length > 0;
  },

  get ssoAutoLoginEnabled(): boolean {
    return ssoAutoLoginEnabled;
  },

  setSsoAutoLoginEnabled(enabled: boolean): void {
    ssoAutoLoginEnabled = enabled;
  },
};
