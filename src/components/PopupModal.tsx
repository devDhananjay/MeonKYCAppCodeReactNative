import React from 'react';
import {Linking, Pressable, ScrollView, Text, View} from 'react-native';
import {EnvConfig} from '../config/env';
import {MaterialColors} from '../theme/kycTheme';
import {MaterialIcon} from './MaterialIcon';

interface PopupModalProps {
  popupData: Record<string, any>;
  onClose: () => void;
  onSelect: (value: string) => void;
  fieldName: string;
}

/** Tap-to-open placeholder used for the tariff PDF (Flutter's custom `InAppWebView` widget). */
function InAppWebView({url}: {url: string}) {
  return (
    <Pressable
      onPress={() => {
        Linking.openURL(url).catch(() => {});
      }}
      style={{
        flex: 1,
        borderWidth: 1,
        borderColor: MaterialColors.grey,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <MaterialIcon name="picture_as_pdf" size={64} color={MaterialColors.redShade400} />
      <View style={{height: 8}} />
      <Text>Tap to open PDF in browser</Text>
    </Pressable>
  );
}

const plans: string[][] = [
  ['Equity Intraday', 'Flat Rs 20 or 0.03% (whichever is lower) per executed order'],
  ['Equity Delivery', 'Flat Rs 20 or 0.30% (whichever is lower) per executed order'],
  ['Currency Option', 'Flat Rs 20 or 0.03% (whichever is lower) per executed order'],
  ['Equity Options', 'Flat Rs 20 per executed order (on Turnover)'],
];

function BrokerageContent({onSelect, onClose}: {onSelect: (v: string) => void; onClose: () => void}) {
  return (
    <View style={{alignSelf: 'stretch'}}>
      <Text style={{fontSize: 18, fontWeight: '600'}}>Without RM (After 30th June)</Text>
      <View style={{height: 16}} />
      {plans.map(p => (
        <View key={p[0]} style={{paddingBottom: 12}}>
          <View
            style={{
              padding: 12,
              backgroundColor: MaterialColors.greyShade100,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: MaterialColors.greyShade300,
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}>
            <Text style={{fontWeight: '500'}}>{p[0]}</Text>
            <Text style={{flex: 1, fontSize: 12, color: MaterialColors.greyShade700, textAlign: 'right'}}>{p[1]}</Text>
          </View>
        </View>
      ))}
      <View style={{height: 16}} />
      <Pressable
        onPress={() => {
          onSelect('BROKERAGE MODULE');
          onClose();
        }}
        style={{
          backgroundColor: '#1E88E5',
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 4,
          alignItems: 'center',
        }}>
        <Text style={{color: '#FFFFFF', fontSize: 14, fontWeight: '500'}}>Select This Plan</Text>
      </Pressable>
    </View>
  );
}

function PdfContent({onClose}: {onClose: () => void}) {
  return (
    <View>
      <View style={{height: 400}}>
        <InAppWebView url={`${EnvConfig.baseUrl}/static/static_upload_files/kediacapital/Tariff%20Plan.pdf`} />
      </View>
      <View style={{height: 16}} />
      <Pressable
        onPress={onClose}
        style={{
          borderWidth: 1,
          borderColor: MaterialColors.black12,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 4,
          alignItems: 'center',
        }}>
        <Text style={{color: MaterialColors.red, fontSize: 14, fontWeight: '500'}}>Close</Text>
      </Pressable>
    </View>
  );
}

/** Full-screen popup (used via an overlay by the form field widget). Port of components/popup_modal.dart. */
export function PopupModal({onClose, onSelect, fieldName}: PopupModalProps) {
  return (
    <Pressable
      onPress={onClose}
      style={{flex: 1, backgroundColor: MaterialColors.black54, alignItems: 'center', justifyContent: 'center'}}>
      <Pressable
        onPress={() => {}}
        style={{margin: 16, maxWidth: 600, maxHeight: 500, alignSelf: 'stretch', backgroundColor: '#FFFFFF', borderRadius: 12}}>
        <View
          style={{
            padding: 16,
            backgroundColor: '#1565C0',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
          <Text style={{color: '#FFFFFF', fontSize: 20, fontWeight: 'bold'}}>
            {fieldName === 'view_equity_plan' ? 'Select Brokerage Plan' : 'Tariff Sheet'}
          </Text>
          <Pressable onPress={onClose} hitSlop={8} style={{padding: 8}}>
            <MaterialIcon name="close" color="#FFFFFF" />
          </Pressable>
        </View>
        <ScrollView style={{flexGrow: 0}} contentContainerStyle={{padding: 24}}>
          {fieldName === 'view_equity_plan' ? (
            <BrokerageContent onSelect={onSelect} onClose={onClose} />
          ) : fieldName === 'tarrif_sheet' ? (
            <PdfContent onClose={onClose} />
          ) : null}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}
