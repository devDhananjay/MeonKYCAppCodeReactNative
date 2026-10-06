import React, {useCallback, useState} from 'react';
import {ActivityIndicator, Modal, Pressable, Text, View} from 'react-native';
import {KycTheme, withOpacity} from '../theme/kycTheme';
import {AnyMap, toStr} from '../utils/dartHelpers';
import {MaterialIcon} from './MaterialIcon';

const _foKeys = new Set<string>(['nse_fo', 'bse_fo']);
/** Mandatory segments (live parity): always on, user cannot untick. */
const _lockedSegmentKeys = new Set<string>(['nse_cash', 'bse_cash', 'mf']);
/**
 * Always off; user cannot select.
 * Keep for when NSE SLBM checkbox is re-enabled in the UI below.
 */
const _disabledOffSegmentKeys = new Set<string>([
  // 'nse_slbm',
]);
const _linkBlue = '#2563EB';

interface CheckboxItem {
  label: string;
  key: string;
}

const segmentRows: CheckboxItem[][] = [
  [
    {label: 'NSE CASH', key: 'nse_cash'},
    {label: 'BSE CASH', key: 'bse_cash'},
  ],
  [
    {label: 'NSE FO', key: 'nse_fo'},
    {label: 'BSE FO', key: 'bse_fo'},
  ],
  [
    // TODO: uncomment to show NSE SLBM again
    // {label: 'NSE SLBM', key: 'nse_slbm'},
    {label: 'MF', key: 'mf'},
  ],
];

function coerceBool(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (value == null) return false;
  const str = toStr(value).toLowerCase();
  return str === 'true' || str === '1' || str === 'yes';
}

function FoDocBullet({text}: {text: string}) {
  return (
    <View style={{paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-start'}}>
      <View style={{paddingTop: 7, paddingRight: 10, paddingLeft: 4}}>
        <View style={{width: 5, height: 5, borderRadius: 2.5, backgroundColor: KycTheme.textPrimary}} />
      </View>
      <Text style={{flex: 1, fontSize: 14, fontWeight: '500', color: KycTheme.textPrimary, lineHeight: 14 * 1.4}}>
        {text}
      </Text>
    </View>
  );
}

function Checkbox({
  label,
  value,
  locked,
  onChanged,
}: {
  label: string;
  value: boolean;
  locked: boolean;
  onChanged: (v: boolean) => void;
}) {
  // Locked segments: non-interactive, but look the same as normal checkboxes
  // (no greyed-out / disabled styling).
  return (
    <Pressable
      disabled={locked}
      onPress={() => onChanged(!value)}
      style={{flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 8}}>
      <View
        style={{
          width: 22,
          height: 22,
          backgroundColor: value ? KycTheme.buttonEnabledPurple : 'transparent',
          borderWidth: 2,
          borderColor: KycTheme.buttonEnabledPurple,
          borderRadius: 6,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {value ? <MaterialIcon name="check" size={12} color="#FFFFFF" /> : null}
      </View>
      <View style={{width: 8}} />
      <Text style={{flexShrink: 1, fontSize: 14, fontWeight: '700', color: KycTheme.textPrimary}}>{label}</Text>
    </Pressable>
  );
}

interface SegmentsSelectionProps {
  formData: AnyMap;
  onChange: (name: string, value: any) => void;
  onViewBrokeragePlan?: (() => void) | null;
  onSubmit?: (() => void) | null;
  submitLoading?: boolean;
  /** Whether the user has viewed/selected the brokerage plan */
  hasBrokeragePlanSelected?: boolean;
}

/**
 * Trading segments selection UI as per design.
 * Grid shows only NSE/BSE cash, FO, MF (no MTF / currency columns) - submit payload matches
 * via HomePage `_prepareFormData` (mtf/currency false).
 *
 * UX: when user toggles NSE FO / BSE FO from OFF -> ON, show a one-time reminder modal listing
 * the financial documents required to enable FO.
 *
 * Brokerage Plan: User must view/select a brokerage plan before proceeding.
 */
export function SegmentsSelection({
  formData,
  onChange,
  onViewBrokeragePlan,
  onSubmit,
  submitLoading = false,
  hasBrokeragePlanSelected = false,
}: SegmentsSelectionProps) {
  const [foPromptFor, setFoPromptFor] = useState<string | null>(null);

  const getValue = (key: string): boolean => {
    const val = formData[key];
    if (val == null) return false;
    if (typeof val === 'boolean') return val;
    const str = toStr(val).toLowerCase();
    return str === 'true' || str === '1' || str === 'yes';
  };

  const handleSegmentChange = (name: string, value: any) => {
    if (_disabledOffSegmentKeys.has(name)) {
      return;
    }
    if (_lockedSegmentKeys.has(name) && !coerceBool(value)) {
      return;
    }
    const wasEnabled = getValue(name);
    const willEnable = coerceBool(value);

    // NSE FO / BSE FO: show reminder first; tick only after user taps OK.
    if (_foKeys.has(name) && !wasEnabled && willEnable) {
      setFoPromptFor(name);
      return;
    }

    onChange(name, value);
  };

  const confirmFo = useCallback(() => {
    const name = foPromptFor;
    setFoPromptFor(null);
    if (name == null) return;
    // Apply after dialog closes so we don't notify during the pop frame.
    setTimeout(() => onChange(name, true), 0);
  }, [foPromptFor, onChange]);

  const submitDisabled = submitLoading || (onViewBrokeragePlan != null && !hasBrokeragePlanSelected);

  return (
    <View style={{alignSelf: 'stretch'}}>
      <View style={{alignItems: 'center'}}>
        <Text
          style={{
            textAlign: 'center',
            fontSize: 18,
            fontWeight: '700',
            color: KycTheme.textPrimary,
            lineHeight: 18 * 1.25,
          }}>
          {'Select Your Preferred\nSegments'}
        </Text>
      </View>
      <View style={{height: 24}} />
      {segmentRows.map((pair, rowIdx) => {
        const buildItem = (item: CheckboxItem) => (
          <Checkbox
            label={item.label}
            value={_lockedSegmentKeys.has(item.key) ? true : _disabledOffSegmentKeys.has(item.key) ? false : getValue(item.key)}
            locked={_lockedSegmentKeys.has(item.key) || _disabledOffSegmentKeys.has(item.key)}
            onChanged={v => handleSegmentChange(item.key, v)}
          />
        );
        return (
          <View key={rowIdx} style={{paddingBottom: 12, flexDirection: 'row', alignItems: 'flex-start'}}>
            <View style={{flex: 1}}>{buildItem(pair[0])}</View>
            <View style={{width: 16}} />
            <View style={{flex: 1}}>{pair.length > 1 ? buildItem(pair[1]) : null}</View>
          </View>
        );
      })}
      <View style={{height: 8}} />
      {onViewBrokeragePlan != null ? (
        <>
          <View style={{alignItems: 'center'}}>
            <Pressable onPress={onViewBrokeragePlan}>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '600',
                  color: _linkBlue,
                  textDecorationLine: 'underline',
                  textDecorationColor: _linkBlue,
                }}>
                View Brokerage Plan
              </Text>
            </Pressable>
          </View>
          <View style={{height: 8}} />
          <View style={{alignItems: 'center'}}>
            <Text
              style={{
                textAlign: 'center',
                fontSize: 14,
                fontWeight: '600',
                color: hasBrokeragePlanSelected ? KycTheme.success : '#DC2626', // Red color for warning
              }}>
              {hasBrokeragePlanSelected ? 'Brokerage plan applied' : 'Please select brokerage plan'}
            </Text>
          </View>
          <View style={{height: 24}} />
        </>
      ) : (
        <View style={{height: 16}} />
      )}

      {onSubmit != null ? (
        <Pressable
          disabled={submitDisabled}
          onPress={onSubmit}
          style={{
            alignSelf: 'stretch',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 16,
            borderRadius: 12,
            backgroundColor: submitDisabled ? withOpacity(KycTheme.primary, 0.5) : KycTheme.primary,
          }}>
          {submitLoading ? (
            <View style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center'}}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <View style={{width: 12}} />
              <Text style={{fontSize: 16, fontWeight: '600', color: '#FFFFFF'}}>Processing...</Text>
            </View>
          ) : (
            <Text
              style={{
                fontSize: 16,
                fontWeight: '600',
                color: submitDisabled ? 'rgba(28,27,31,0.38)' : '#FFFFFF',
              }}>
              {hasBrokeragePlanSelected || onViewBrokeragePlan == null ? 'Next' : 'Select Plan to Continue'}
            </Text>
          )}
        </Pressable>
      ) : null}

      {/* One-time reminder: financial documents required to enable FO */}
      <Modal visible={foPromptFor != null} transparent animationType="fade" onRequestClose={() => setFoPromptFor(null)}>
        <Pressable
          onPress={() => setFoPromptFor(null)}
          style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.54)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24}}>
          <Pressable
            onPress={() => {}}
            style={{
              alignSelf: 'stretch',
              maxWidth: 560,
              paddingTop: 24,
              paddingHorizontal: 20,
              paddingBottom: 16,
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
            }}>
            <Text
              style={{
                textAlign: 'center',
                fontSize: 15,
                fontWeight: '600',
                color: KycTheme.textPrimary,
                lineHeight: 15 * 1.4,
              }}>
              {'Please upload any one of the following financial documents (required only if selected):'}
            </Text>
            <View style={{height: 16}} />
            <FoDocBullet text="Last 6 months bank statement" />
            <FoDocBullet text="Latest Income Tax Return (ITR) acknowledgement" />
            <FoDocBullet text="Form 16 or salary slips for the last 3 months" />
            <FoDocBullet text="CA-certified Net Worth Certificate" />
            <FoDocBullet text="Latest Demat Holding Statement" />
            <View style={{height: 16}} />
            <View style={{alignItems: 'flex-end'}}>
              <Pressable
                onPress={confirmFo}
                style={{
                  paddingHorizontal: 28,
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: KycTheme.buttonEnabledPurple,
                }}>
                <Text style={{fontSize: 15, fontWeight: '600', color: '#FFFFFF'}}>OK</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
