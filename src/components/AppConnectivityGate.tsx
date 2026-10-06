import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useConnectivity} from '../services/connectivityController';
import {KycTheme} from '../theme/kycTheme';
import {AppAssets} from '../utils/assets';
import {NoInternetScreen} from './NoInternetScreen';

function ConnectivitySplashLoader() {
  return (
    <View style={[StyleSheet.absoluteFill, {backgroundColor: KycTheme.surface}]}>
      <SafeAreaView style={{flex: 1}}>
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
          <Image
            source={AppAssets.stoxboxLogo}
            style={{height: 96, width: 145, borderRadius: 12}}
            resizeMode="contain"
          />
          <View style={{height: 28}} />
          <ActivityIndicator size="small" color={KycTheme.buttonEnabledPurple} />
          <View style={{height: 16}} />
          <Text style={{fontSize: 13, fontWeight: '500', color: '#475569'}}>
            Setting things up, please wait...
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

/** Keeps the app mounted and covers it with offline UI when disconnected. */
export function AppConnectivityGate({children}: {children: React.ReactNode}) {
  const connectivity = useConnectivity();
  const [retrying, setRetrying] = useState(false);
  const retryingRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onRetry = useCallback(async () => {
    if (retryingRef.current) return;
    retryingRef.current = true;
    setRetrying(true);
    try {
      await connectivity.recheck();
    } finally {
      retryingRef.current = false;
      if (mounted.current) setRetrying(false);
    }
  }, [connectivity]);

  return (
    <View style={{flex: 1}}>
      {children}
      {connectivity.isChecking ? <ConnectivitySplashLoader /> : null}
      {connectivity.showNoInternet ? (
        <View style={StyleSheet.absoluteFill}>
          <NoInternetScreen onRetry={onRetry} isRetrying={retrying || connectivity.isChecking} />
        </View>
      ) : null}
    </View>
  );
}
