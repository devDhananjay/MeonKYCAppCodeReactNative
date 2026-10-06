import React, {useState} from 'react';
import {ActivityIndicator, Image, Modal, Pressable, Text, View, useWindowDimensions} from 'react-native';
import {WebView} from 'react-native-webview';
import {SafeAreaInsetsContext} from 'react-native-safe-area-context';
import {KycTheme, MaterialColors} from '../theme/kycTheme';
import {debugPrint} from '../utils/debug';
import {MaterialIcon} from './MaterialIcon';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * In-app tariff PDF preview (iOS). Avoids QuickLook/open_filex reopen race
 * where the first tap after dismiss returns done but shows nothing.
 * Port of `_BpWealthTariffPdfPreviewDialog`.
 */
export function BpWealthTariffPdfPreviewDialog({visible, onClose}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {width, height} = useWindowDimensions();
  const insets = React.useContext(SafeAreaInsetsContext) ?? {top: 0, bottom: 0, left: 0, right: 0};

  const asset = Image.resolveAssetSource(require('../../assets/pdf/bpwealth_tariff_plan.pdf'));
  const uri = asset?.uri ?? '';

  const maxWidth = width - 32;
  const maxHeight = height - (insets.top + insets.bottom) - 40;
  const dialogWidth = Math.min(Math.max(maxWidth, 280), width);
  const dialogHeight = Math.min(Math.max(maxHeight * 0.88, 320), maxHeight);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
      onShow={() => {
        setLoading(true);
        setError(null);
      }}>
      <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.54)', alignItems: 'center', justifyContent: 'center'}}>
        <Pressable style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}} onPress={onClose} />
        <View
          style={{
            width: dialogWidth,
            height: dialogHeight,
            borderRadius: 12,
            overflow: 'hidden',
            backgroundColor: '#FFFFFF',
          }}>
          <View style={{backgroundColor: KycTheme.primary, flexDirection: 'row', alignItems: 'center'}}>
            <View style={{flex: 1, paddingLeft: 16, paddingTop: 14, paddingRight: 8, paddingBottom: 14}}>
              <Text style={{color: '#FFFFFF', fontWeight: '600', fontSize: 16}}>DP Standing Instructions & Tariff</Text>
            </View>
            <Pressable onPress={onClose} style={{width: 48, height: 48, alignItems: 'center', justifyContent: 'center'}}>
              <MaterialIcon name="close" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
          <View style={{flex: 1, backgroundColor: '#FFFFFF'}}>
            {error == null ? (
              <WebView
                source={{uri}}
                originWhitelist={['*']}
                allowFileAccess
                allowingReadAccessToURL={uri}
                javaScriptEnabled
                onLoadEnd={() => setLoading(false)}
                onError={e => {
                  debugPrint(`[HomePage] Tariff PDF WebView error: ${e.nativeEvent.description}`);
                  setLoading(false);
                  setError('Unable to load PDF.');
                }}
              />
            ) : (
              <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24}}>
                <Text style={{textAlign: 'center', fontSize: 14, color: MaterialColors.greyShade700}}>{error}</Text>
              </View>
            )}
            {loading && error == null ? (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <ActivityIndicator color={KycTheme.primary} />
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
