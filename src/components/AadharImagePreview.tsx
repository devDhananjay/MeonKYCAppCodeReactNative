import React, {useState} from 'react';
import {ActivityIndicator, Image, Text, View} from 'react-native';
import {KycTheme, MaterialColors} from '../theme/kycTheme';

interface Props {
  /** Raw base64 payload (no data-URI prefix) – Flutter `Image.memory`. */
  base64?: string | null;
  /** Remote url – Flutter `Image.network` with loading + error builders. */
  url?: string | null;
}

/** DigiLocker Aadhaar photo: 12px radius, 4:3, cover (HomePage `_buildForm`). */
export function AadharImagePreview({base64, url}: Props) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  return (
    <View style={{borderRadius: 12, overflow: 'hidden', aspectRatio: 4 / 3, alignSelf: 'stretch'}}>
      {base64 != null ? (
        <Image
          source={{uri: `data:image/png;base64,${base64}`}}
          resizeMode="cover"
          style={{width: '100%', height: '100%'}}
        />
      ) : failed ? (
        <View
          style={{
            flex: 1,
            backgroundColor: MaterialColors.greyShade200,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{fontSize: 12, color: KycTheme.textSecondary}}>Preview not available</Text>
        </View>
      ) : (
        <>
          <Image
            key={url ?? ''}
            source={{uri: url ?? ''}}
            resizeMode="cover"
            style={{width: '100%', height: '100%'}}
            onLoadEnd={() => setLoading(false)}
            onError={() => setFailed(true)}
          />
          {loading ? (
            <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center'}}>
              <ActivityIndicator color={KycTheme.primary} />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
