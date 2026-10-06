import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

/**
 * Manages tokens and cookies equivalent to js-cookie in React.
 * Secure items live in the OS keychain/keystore (flutter_secure_storage
 * equivalent); the "has run before" flag lives in AsyncStorage
 * (shared_preferences equivalent).
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

async function secureRead(key: string): Promise<string | null> {
  try {
    const res = await Keychain.getGenericPassword({service: SERVICE_PREFIX + key});
    if (!res) return null;
    return res.password;
  } catch (_) {
    return null;
  }
}

async function secureWrite(key: string, value: string): Promise<void> {
  await Keychain.setGenericPassword(key, value, {service: SERVICE_PREFIX + key});
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

// Process-lifetime SSO switch:
// - true by default (fresh app start -> allow SSO)
// - set false on explicit logout (skip SSO; use normal get-workflow/get-user flow)
// - resets to true automatically when app process restarts.
let ssoAutoLoginEnabled = true;

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
      await secureDeleteAll();
      await AsyncStorage.setItem(KEY_HAS_RUN_BEFORE, 'true');
    }
  },

  getAccessToken(): Promise<string | null> {
    return secureRead(KEY_ACCESS_TOKEN);
  },

  setAccessToken(token: string): Promise<void> {
    return secureWrite(KEY_ACCESS_TOKEN, token);
  },

  getRefreshToken(): Promise<string | null> {
    return secureRead(KEY_REFRESH_TOKEN);
  },

  setRefreshToken(token: string): Promise<void> {
    return secureWrite(KEY_REFRESH_TOKEN, token);
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
    await secureDeleteAll();
    await AsyncStorage.clear();
  },

  async clearAuthTokens(): Promise<void> {
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
