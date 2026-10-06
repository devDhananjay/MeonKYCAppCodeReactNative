import React, {useEffect, useState} from 'react';
import {StatusBar, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {getApp} from '@react-native-firebase/app';
import AppToast from './src/components/AppToast';
import {AppConnectivityGate} from './src/components/AppConnectivityGate';
import {AppNavigator} from './src/navigation/AppNavigator';
import {ConnectivityProvider, useConnectivityRead} from './src/services/connectivityController';
import {StorageService} from './src/services/storageService';
import {AppStoreProvider} from './src/store/appStore';
import {debugPrint} from './src/utils/debug';

/**
 * Port of `main()` (lib/main.dart): `ConnectivityController.init()` completes before the app UI is built.
 * (`Firebase.initializeApp` is performed natively by @react-native-firebase from google-services.json /
 * GoogleService-Info.plist; `getApp()` below verifies the default app is available.)
 */
function ConnectivityBootstrap({children}: {children: React.ReactNode}) {
  const connectivity = useConnectivityRead();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await connectivity.init();
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectivity]);
  if (!ready) return <View style={{flex: 1, backgroundColor: '#FFFFFF'}} />;
  return <>{children}</>;
}

export default function App() {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await StorageService.resetOnFreshInstall();
      debugPrint(`hastoken : ${await StorageService.hasAccessToken()}`);
      try {
        getApp(); // Firebase default app (initialised natively).
      } catch (e) {
        debugPrint(`Firebase init error: ${e}`);
      }
      if (!cancelled) setStarted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!started) return <View style={{flex: 1, backgroundColor: '#FFFFFF'}} />;

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AppStoreProvider>
        <ConnectivityProvider>
          <ConnectivityBootstrap>
            <AppConnectivityGate>
              <AppNavigator />
            </AppConnectivityGate>
          </ConnectivityBootstrap>
        </ConnectivityProvider>
      </AppStoreProvider>
      <AppToast />
    </SafeAreaProvider>
  );
}
