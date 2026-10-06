import React from 'react';
import {Modal, Pressable, Text, View} from 'react-native';
import {KycTheme} from '../theme/kycTheme';

interface BrokeragePlanDialogProps {
  visible: boolean;
  /** Called when the user taps "Done" (after the dialog closes). */
  onDone: () => void;
  /** Called when the dialog is dismissed (barrier tap / back button / Done). */
  onDismiss: () => void;
}

function BulletPoint({title, value}: {title: string; value: string}) {
  const base = {fontSize: 14, color: KycTheme.textPrimary, lineHeight: 21};
  return (
    <View style={{paddingLeft: 12, flexDirection: 'row', alignItems: 'flex-start'}}>
      <Text style={base}>{'• '}</Text>
      <Text style={[base, {flex: 1}]}>
        <Text style={{fontWeight: '600'}}>{`${title} - `}</Text>
        <Text style={{fontWeight: '400'}}>{value}</Text>
      </Text>
    </View>
  );
}

/** Brokerage Plan Dialog as per design (port of components/brokerage_plan_dialog.dart). */
export function BrokeragePlanDialog({visible, onDone, onDismiss}: BrokeragePlanDialogProps) {
  const sectionTitle = {fontSize: 16, fontWeight: '600' as const, color: KycTheme.textPrimary};
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable
        onPress={onDismiss}
        style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.54)', alignItems: 'center', justifyContent: 'center', padding: 40}}>
        <Pressable
          onPress={() => {}}
          style={{alignSelf: 'stretch', maxWidth: 560, padding: 24, backgroundColor: '#FFFFFF', borderRadius: 16}}>
          <Text style={{textAlign: 'center', fontSize: 18, fontWeight: '700', color: KycTheme.textPrimary}}>
            Brokerage Plan Name
          </Text>
          <View style={{height: 20}} />

          {/* Equities Section */}
          <Text style={sectionTitle}>Equities - NSE / BSE</Text>
          <View style={{height: 12}} />
          <BulletPoint title="Delivery" value="0.3% (Min. 3p per share whichever is higher)" />
          <View style={{height: 8}} />
          <BulletPoint title="Trading" value="0.03% (Min. 3p per share whichever is higher)" />
          <View style={{height: 20}} />

          {/* Futures & Options Section */}
          <Text style={sectionTitle}>NSE - BSE FO/ Commodity/ Currency</Text>
          <View style={{height: 12}} />
          <BulletPoint title="Futures" value="0.03% (Min. 3p per share whichever is higher)" />
          <View style={{height: 8}} />
          <BulletPoint title="Options" value="30/lot" />
          <View style={{height: 32}} />

          {/* Done Button */}
          <Pressable
            onPress={() => {
              onDismiss();
              onDone();
            }}
            style={{
              alignSelf: 'stretch',
              alignItems: 'center',
              paddingVertical: 16,
              borderRadius: 12,
              backgroundColor: KycTheme.primary,
            }}>
            <Text style={{fontSize: 16, fontWeight: '600', color: '#FFFFFF'}}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
