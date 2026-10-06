import React from 'react';
import {ActivityIndicator, Image, Pressable, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {KycTheme, MaterialColors, withOpacity} from '../theme/kycTheme';
import {AppAssets} from '../utils/assets';

interface NoInternetScreenProps {
  onRetry: () => void;
  isRetrying?: boolean;
}

/** Full-screen offline UI (STOXBOX splash style). */
export function NoInternetScreen({onRetry, isRetrying = false}: NoInternetScreenProps) {
  return (
    <View style={{flex: 1, backgroundColor: KycTheme.surface}}>
      <SafeAreaView style={{flex: 1}}>
        <View style={{flex: 1, paddingHorizontal: 24}}>
          <View style={{height: 48}} />
          <View style={{alignItems: 'center'}}>
            <Image
            source={AppAssets.stoxboxLogo}
            style={{height: 96, width: 145, borderRadius: 12}}
            resizeMode="contain"
          />
          </View>
          <View style={{flex: 1}} />
          <View
            style={[
              {
                alignSelf: 'stretch',
                paddingTop: 28,
                paddingHorizontal: 24,
                paddingBottom: 24,
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
              },
              KycTheme.cardShadow,
            ]}>
            <Text
              style={{
                textAlign: 'center',
                fontSize: 16,
                fontWeight: '500',
                color: MaterialColors.greyShade700,
                lineHeight: 16 * 1.45,
              }}>
              {'Low internet connection.\nKindly retry'}
            </Text>
            <View style={{height: 24}} />
            <Pressable
              disabled={isRetrying}
              onPress={onRetry}
              style={{
                alignSelf: 'stretch',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 14,
                borderRadius: 10,
                backgroundColor: isRetrying ? KycTheme.buttonDisabledPurple : KycTheme.buttonEnabledPurple,
              }}>
              {isRetrying ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={{fontSize: 16, fontWeight: '600', color: '#FFFFFF'}}>Retry</Text>
              )}
            </Pressable>
          </View>
          <View style={{flex: 1}} />
          <View style={{paddingHorizontal: 8}}>
            <Text
              style={{
                textAlign: 'center',
                fontSize: 10,
                lineHeight: 10 * 1.35,
                color: withOpacity(MaterialColors.greyShade700, 0.85),
              }}>
              {'BP Equities Pvt Ltd (SEBI Regn No: INZ000176730, BSE: 6744, NSE: 90309). ' +
                'Copyright © 2023 BP Group. All rights reserved.'}
            </Text>
          </View>
          <View style={{height: 16}} />
          <Text
            style={{
              textAlign: 'center',
              fontSize: 13,
              fontWeight: '500',
              color: withOpacity(MaterialColors.greyShade800, 0.9),
            }}>
            {isRetrying ? 'Checking connection, please wait...' : 'Setting things up, please wait...'}
          </Text>
          <View style={{height: 24}} />
        </View>
      </SafeAreaView>
    </View>
  );
}
