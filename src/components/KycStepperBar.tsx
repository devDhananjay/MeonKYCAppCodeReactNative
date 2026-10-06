import React, {useCallback, useEffect, useRef} from 'react';
import {Image, LayoutChangeEvent, ScrollView, Text, View} from 'react-native';
import {KycTheme} from '../theme/kycTheme';
import {AppAssets} from '../utils/assets';
import {MaterialIcon} from './MaterialIcon';

const defaultSteps: string[] = [
  'mobile',
  'mobile_otp',
  'email',
  'email_otp',
  'segments',
  'detailspan',
  'kra_fetch_new',
  'kradetails',
  'digilocker',
  'pan',
  'personal_details',
  'nominee',
  'additional_nominee',
  'additional_nominee_second',
  'nominee_mobile',
  'mobile_otp',
  'reverse_pennydrop',
  'bank',
  'bank_details',
  'account_aggregator',
  'liveimage',
  'pan_upload',
  'sign_upload',
  'income_proof',
  'bank_upload',
  'pdf',
  'esign',
  'complete',
];

const stepDisplayNames: Record<string, string> = {
  detailspan: 'PAN',
  kradetails: 'KRA Details',
  pan: 'PAN',
  personal_details: 'Personal Details',
  nominee: 'Add Nominees',
  nominee_mobile: 'Nominee Opt-Out',
  bank: 'Bank Details',
  bank_details: 'Bank Details',
  pan_upload: 'Upload PAN Proof',
  income_proof: 'Upload Income Proof',
  sign_upload: 'Upload Signature Proof',
  bank_upload: 'Upload Bank Proof',
};

/** Workflow position -> header / stepper label (falls back to title case). */
function formatLabel(label: string): string {
  const key = label.trim().toLowerCase();
  const mapped = Object.prototype.hasOwnProperty.call(stepDisplayNames, key) ? stepDisplayNames[key] : undefined;
  if (mapped != null) return mapped;
  return label
    .split('_')
    .join(' ')
    .split(' ')
    .map(word => (word.length === 0 ? '' : word[0].toUpperCase() + word.substring(1).toLowerCase()))
    .join(' ');
}

interface KycStepperBarProps {
  steps: string[];
  currentIndex?: number;
}

/**
 * Stepper as per design: 1. Mobile Verify, 2. Email Verify, 3. Pan Details, etc.
 * - Completed: purple circle with white checkmark inside
 * - Active: purple circle with step number inside, bold label below
 * - Inactive: grey circle with number, grey label below
 * - Active step is kept centered; horizontal scroll to see prev/next
 */
function KycStepperBarImpl({steps, currentIndex = 0}: KycStepperBarProps) {
  const scrollRef = useRef<any>(null);
  const viewportWidth = useRef(0);
  const contentWidth = useRef(0);
  const scrollX = useRef(0);
  // x offset + width of each step (relative to scroll content)
  const stepLayouts = useRef<Record<number, {x: number; width: number}>>({});

  const list = steps.length === 0 ? defaultSteps : steps;

  const scrollToCenterActive = useCallback(() => {
    const idx = Math.min(Math.max(currentIndex, 0), list.length - 1);
    const layout = stepLayouts.current[idx];
    if (layout == null || viewportWidth.current <= 0) return;
    const stepCenter = layout.x + layout.width / 2;
    const target = stepCenter - viewportWidth.current / 2;
    const maxScroll = Math.max(0, contentWidth.current - viewportWidth.current);
    const clamped = Math.min(Math.max(target, 0), maxScroll);
    scrollRef.current?.scrollTo({x: clamped, y: 0, animated: true});
  }, [currentIndex, list.length]);

  useEffect(() => {
    const t = setTimeout(scrollToCenterActive, 0);
    return () => clearTimeout(t);
  }, [scrollToCenterActive, steps]);

  const onStepLayout = (idx: number) => (e: LayoutChangeEvent) => {
    stepLayouts.current[idx] = {x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width};
    if (idx === currentIndex) scrollToCenterActive();
  };

  const children: React.ReactNode[] = [];
  for (let i = 0; i < list.length * 2 - 1; i++) {
    if (i % 2 === 1) {
      const prevIdx = Math.trunc((i - 1) / 2);
      const nextIdx = prevIdx + 1;
      const isSegmentDone = prevIdx < currentIndex;

      // Show rocket icon only on the connector just BEFORE the current step
      const isConnectorBeforeCurrent = nextIdx === currentIndex;

      if (isConnectorBeforeCurrent) {
        children.push(
          <View
            key={`c${i}`}
            style={{
              paddingTop: KycTheme.spacingLg + 2,
              paddingLeft: KycTheme.spacingSm,
              paddingRight: KycTheme.spacingSm,
            }}>
            <View style={{opacity: isSegmentDone ? 1.0 : 0.3, transform: [{translateY: -10}]}}>
              <Image source={AppAssets.stepConnector} style={{width: 26, height: 22}} />
            </View>
          </View>,
        );
        continue;
      }

      // Default connector line for all other connectors
      children.push(
        <View
          key={`c${i}`}
          style={{
            marginTop: KycTheme.spacingLg,
            marginLeft: KycTheme.spacingSm,
            marginRight: KycTheme.spacingSm,
            width: 32,
            height: 2,
            backgroundColor: isSegmentDone ? KycTheme.primary : KycTheme.border,
            borderRadius: 1,
          }}
        />,
      );
      continue;
    }
    const idx = Math.trunc(i / 2);
    const isPast = idx < currentIndex;
    const isActive = idx === currentIndex;
    const stepLabel = formatLabel(list[idx]);
    children.push(
      <View
        key={`s${i}`}
        onLayout={onStepLayout(idx)}
        style={{paddingHorizontal: KycTheme.spacingMd, alignItems: 'center'}}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: isPast || isActive ? KycTheme.primary : 'transparent',
            borderWidth: 2,
            borderColor: isPast || isActive ? KycTheme.primary : KycTheme.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {isPast ? (
            <MaterialIcon name="check" size={15} color="#FFFFFF" />
          ) : (
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: isActive || isPast ? '#FFFFFF' : KycTheme.textSecondary,
              }}>
              {`${idx + 1}`}
            </Text>
          )}
        </View>
        <View style={{height: KycTheme.spacingSm}} />
        <View style={{maxWidth: 110}}>
          <Text
            numberOfLines={2}
            ellipsizeMode="tail"
            style={{
              fontSize: KycTheme.fontSizeCaption,
              fontWeight: isActive ? '700' : '500',
              color: isActive || isPast ? KycTheme.textPrimary : KycTheme.textSecondary,
              textAlign: 'center',
            }}>
            {stepLabel}
          </Text>
        </View>
      </View>,
    );
  }

  return (
    <View
      onLayout={e => {
        viewportWidth.current = e.nativeEvent.layout.width - 2 * KycTheme.spacingLg;
        scrollToCenterActive();
      }}
      style={{
        paddingVertical: KycTheme.spacingLg,
        paddingHorizontal: KycTheme.spacingLg,
        backgroundColor: KycTheme.surface,
      }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={e => {
          scrollX.current = e.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={16}
        onContentSizeChange={w => {
          contentWidth.current = w;
        }}
        contentContainerStyle={{alignItems: 'flex-start'}}>
        {children}
      </ScrollView>
    </View>
  );
}

export const KycStepperBar = Object.assign(KycStepperBarImpl, {
  defaultSteps,
  stepDisplayNames,
  formatLabel,
});
