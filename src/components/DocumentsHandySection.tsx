import React from 'react';
import {Text, View} from 'react-native';
import {KycTheme} from '../theme/kycTheme';
import {MaterialIcon, MaterialIconName} from './MaterialIcon';

interface DocItem {
  label: string;
  icon: MaterialIconName;
}

const itemsLeft: DocItem[] = [
  {label: 'PAN Card', icon: 'badge_outlined'},
  {label: 'Income Proof', icon: 'receipt_long_outlined'},
  {label: 'Nominee Proof', icon: 'people_outline'},
];
const itemsRight: DocItem[] = [
  {label: 'Bank Proof', icon: 'account_balance_outlined'},
  {label: 'Signature', icon: 'draw_outlined'},
];

function DocItemRow({e}: {e: DocItem}) {
  return (
    <View style={{paddingBottom: KycTheme.spacingSm, flexDirection: 'row', alignItems: 'center'}}>
      <MaterialIcon name="check_circle" size={20} color={KycTheme.success} />
      <View style={{width: KycTheme.spacingSm}} />
      <Text style={{fontSize: KycTheme.fontSizeBody, color: KycTheme.textPrimary, flexShrink: 1}}>{e.label}</Text>
    </View>
  );
}

/** "Documents to keep Handy" section from Figma (bottom of KYC screens) */
export function DocumentsHandySection() {
  return (
    <View
      style={[
        {
          alignSelf: 'stretch',
          paddingHorizontal: KycTheme.spacingXl,
          paddingVertical: KycTheme.spacingLg,
          backgroundColor: KycTheme.surface,
          borderRadius: KycTheme.radiusMd,
          borderWidth: 1,
          borderColor: KycTheme.border,
        },
        KycTheme.cardShadowSm,
      ]}>
      <Text style={{fontSize: KycTheme.fontSizeTitleSm, fontWeight: '700', color: KycTheme.textPrimary}}>
        Documents to keep Handy
      </Text>
      <View style={{height: KycTheme.spacingMd}} />
      <View style={{flexDirection: 'row', alignItems: 'flex-start'}}>
        <View style={{flex: 1}}>
          {itemsLeft.map(e => (
            <DocItemRow key={e.label} e={e} />
          ))}
        </View>
        <View style={{flex: 1}}>
          {itemsRight.map(e => (
            <DocItemRow key={e.label} e={e} />
          ))}
        </View>
      </View>
    </View>
  );
}
