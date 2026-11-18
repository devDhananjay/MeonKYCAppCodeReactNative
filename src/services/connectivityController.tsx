import React, {createContext, useContext, useRef} from 'react';
import {AppState, AppStateStatus, NativeEventSubscription} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {EnvConfig} from '../config/env';
import {ChangeNotifier, useNotifier} from '../utils/changeNotifier';
import {debugPrint} from '../utils/debug';

const CHECK_INTERVAL_MS = 5000;
const PROBE_TIMEOUT_MS = 4000;
const OVERALL_CHECK_TIMEOUT_MS = 5000;

function withOverallTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      v => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** Reachability probe — short GET; 2xx–3xx = reachable. */
async function checkUri(uri: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(uri, {
      method: 'GET',
      signal: controller.signal,
      headers: {Accept: '*/*'},
    });
    return res.status >= 200 && res.status < 400;
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Online if the device link is up AND (any probe succeeds OR probes time out while
 * NetInfo still reports connectivity). Avoids false "Low internet" / stuck splash
 * when office DNS/IPv6 makes one host hang.
 */
async function hasInternetAccess(): Promise<boolean> {
  const net = await NetInfo.fetch();
  const linkUp = net.isConnected !== false && net.isInternetReachable !== false;
  if (!linkUp && net.isConnected === false) {
    debugPrint('[Connectivity] NetInfo reports disconnected');
    return false;
  }

  const probes = await withOverallTimeout(
    Promise.all([
      checkUri('https://www.google.com/generate_204'),
      checkUri('https://clients3.google.com/generate_204'),
      checkUri(EnvConfig.baseUrl),
    ]),
    OVERALL_CHECK_TIMEOUT_MS,
    [false, false, false] as boolean[],
  );

  if (probes.some(Boolean)) {
    debugPrint(`[Connectivity] probe ok linkUp=${linkUp} probes=${JSON.stringify(probes)}`);
    return true;
  }

  // Probes failed/timed out but the OS still thinks we have a network — treat as online
  // so KYC setup is not blocked by a flaky reachability host.
  if (net.isConnected === true) {
    debugPrint('[Connectivity] probes failed but NetInfo connected — treating as online');
    return true;
  }

  debugPrint(`[Connectivity] offline probes=${JSON.stringify(probes)} net=${JSON.stringify(net)}`);
  return false;
}

/** Global internet monitor - used by AppConnectivityGate across the app. */
export class ConnectivityController extends ChangeNotifier {
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _appStateSub: NativeEventSubscription | null = null;
  private _listening = false;
  private _checkInFlight = false;
  private _lastStatus: boolean | null = null;

  private _isConnected = true;
  private _isChecking = true;
  private _wasDisconnected = false;
  private _reconnectToken = 0;
  private _disposed = false;

  get isConnected(): boolean {
    return this._isConnected;
  }
  get isChecking(): boolean {
    return this._isChecking;
  }
  get showNoInternet(): boolean {
    return !this._isChecking && !this._isConnected;
  }
  get reconnectToken(): number {
    return this._reconnectToken;
  }

  async init(): Promise<void> {
    try {
      this._isConnected = await withOverallTimeout(
        hasInternetAccess(),
        OVERALL_CHECK_TIMEOUT_MS + 1000,
        true, // fail-open on init so splash cannot stick forever
      );
      this._lastStatus = this._isConnected;
      if (!this._isConnected) this._wasDisconnected = true;
    } finally {
      this._isChecking = false;
      this.notifyListeners();
    }
    this._startListening();
    this._appStateSub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') this._startListening();
      else if (s === 'background' || s === 'inactive') this._stopListening();
    });
  }

  private _startListening(): void {
    this._stopListening();
    if (this._disposed) return;
    this._listening = true;
    this._timer = setInterval(() => {
      this._poll();
    }, CHECK_INTERVAL_MS);
  }

  private _stopListening(): void {
    this._listening = false;
    if (this._timer != null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  private async _poll(): Promise<void> {
    if (this._checkInFlight || !this._listening) return;
    this._checkInFlight = true;
    try {
      const connected = await withOverallTimeout(
        hasInternetAccess(),
        OVERALL_CHECK_TIMEOUT_MS + 1000,
        this._isConnected,
      );
      if (!this._listening || this._disposed) return;
      if (this._lastStatus === connected) return;
      this._lastStatus = connected;
      this._onStatus(connected);
    } finally {
      this._checkInFlight = false;
    }
  }

  private _onStatus(connected: boolean): void {
    if (this._isConnected === connected) return;

    const wasOff = !this._isConnected;
    this._isConnected = connected;
    this._isChecking = false;

    if (!connected) {
      this._wasDisconnected = true;
    } else if (wasOff && connected) {
      this._reconnectToken++;
      this._wasDisconnected = false;
    }

    this.notifyListeners();
  }

  /** Manual retry from the no-internet screen. */
  async recheck(): Promise<void> {
    this._isChecking = true;
    this.notifyListeners();

    try {
      const connected = await withOverallTimeout(
        hasInternetAccess(),
        OVERALL_CHECK_TIMEOUT_MS + 1000,
        true,
      );
      this._lastStatus = connected;
      const wasOff = !this._isConnected;
      this._isConnected = connected;

      if (!connected) {
        this._wasDisconnected = true;
      } else {
        if (wasOff || this._wasDisconnected) {
          this._reconnectToken++;
        }
        this._wasDisconnected = false;
      }
    } finally {
      this._isChecking = false;
      this.notifyListeners();
    }
  }

  dispose(): void {
    this._disposed = true;
    this._stopListening();
    this._appStateSub?.remove();
    this._appStateSub = null;
  }
}

const ConnectivityContext = createContext<ConnectivityController | null>(null);

export function ConnectivityProvider({children}: {children: React.ReactNode}) {
  const ref = useRef<ConnectivityController | null>(null);
  if (ref.current == null) ref.current = new ConnectivityController();
  return <ConnectivityContext.Provider value={ref.current}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): ConnectivityController {
  const c = useContext(ConnectivityContext);
  if (c == null) throw new Error('useConnectivity must be used inside ConnectivityProvider');
  return useNotifier(c);
}

export function useConnectivityRead(): ConnectivityController {
  const c = useContext(ConnectivityContext);
  if (c == null) throw new Error('useConnectivityRead must be used inside ConnectivityProvider');
  return c;
}
