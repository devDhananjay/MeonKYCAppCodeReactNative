import React, {useRef, useState} from 'react';
import {Modal, Pressable, ScrollView, Text, useWindowDimensions, View} from 'react-native';
import Svg, {Rect} from 'react-native-svg';
import {KycTheme} from '../theme/kycTheme';
import {isCheckboxCheckedValue} from '../utils/conditionalFlow';
import {AnyMap} from '../utils/dartHelpers';
import {
  isNomineeAddNomineeDropdownField,
  isNomineeBackendOnlyField,
  isNomineeOptOutConsentField,
  isNomineeStyledAddCheckboxField,
} from '../utils/fieldValidators';
import {MaterialIcon} from './MaterialIcon';
import {KycCheckbox} from './MaterialButtons';

const _maxNomineesHint = 'You can add maximum of 10 nominees';

/** Web-parity nominee step chrome: dashed Add/Remove nominee + optional add-more buttons. */
function DashedActionCard({onTap, children}: {onTap: () => void; children: React.ReactNode}) {
  const [size, setSize] = useState({w: 0, h: 0});
  const radius = KycTheme.radiusMd;
  return (
    <Pressable
      onPress={onTap}
      style={{backgroundColor: '#F8F9FB', borderRadius: radius, alignSelf: 'stretch'}}
      onLayout={e => setSize({w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height})}>
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h} style={{position: 'absolute', left: 0, top: 0}} pointerEvents="none">
          <Rect
            x={0.6}
            y={0.6}
            width={size.w - 1.2}
            height={size.h - 1.2}
            rx={radius}
            ry={radius}
            stroke="#B8BEC8"
            strokeWidth={1.2}
            strokeDasharray="6 4"
            fill="none"
          />
        </Svg>
      ) : null}
      <View style={{alignSelf: 'stretch', paddingVertical: 18, paddingHorizontal: 16, alignItems: 'center'}}>
        {children}
      </View>
    </Pressable>
  );
}

export function NomineePrimaryToggle({
  addingNominee,
  onAdd,
  onRemove,
}: {
  addingNominee: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <DashedActionCard onTap={addingNominee ? onRemove : onAdd}>
      <Text style={{fontSize: KycTheme.fontSizeBodyLg, fontWeight: '700', color: KycTheme.primary}}>
        {addingNominee ? '− Remove Nominee' : '+ Add Nominee (Optional)'}
      </Text>
    </DashedActionCard>
  );
}

export function NomineeMaxNomineesHint() {
  return (
    <View style={{paddingTop: 8, paddingBottom: 4}}>
      <Text style={{fontSize: KycTheme.fontSizeCaption, color: KycTheme.textSecondary}}>{_maxNomineesHint}</Text>
    </View>
  );
}

const declBodyStyle = {
  fontSize: 12,
  fontWeight: '400' as const,
  color: '#475569',
  lineHeight: 18,
};

function DeclarationBullet({index, text}: {index: string; text: string}) {
  return (
    <View style={{flexDirection: 'row', alignItems: 'flex-start'}}>
      <View style={{width: 22}}>
        <Text style={declBodyStyle}>{index}</Text>
      </View>
      <Text style={[declBodyStyle, {flex: 1}]}>{text}</Text>
    </View>
  );
}

/** Declaration for opting out of nomination (Flutter `showOptOutDeclarationDialog`). */
export function OptOutDeclarationDialog({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const {height} = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28}}>
        <Pressable
          onPress={() => {}}
          style={{
            alignSelf: 'stretch',
            maxWidth: 360,
            maxHeight: height * 0.8,
            backgroundColor: '#FFFFFF',
            borderRadius: 14,
            paddingTop: 18,
            paddingLeft: 20,
            paddingRight: 12,
            paddingBottom: 20,
          }}>
          <View style={{flexDirection: 'row', alignItems: 'flex-start'}}>
            <View style={{flex: 1, paddingTop: 4, paddingRight: 8}}>
              <Text style={{fontSize: 15, fontWeight: '700', color: KycTheme.textPrimary, lineHeight: 15 * 1.35}}>
                Declaration for Opting-out of Nomination
              </Text>
            </View>
            <Pressable onPress={onClose} style={{width: 32, height: 32, alignItems: 'center', justifyContent: 'center'}}>
              <MaterialIcon name="close" size={20} color={KycTheme.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={{flexGrow: 0, flexShrink: 1}} contentContainerStyle={{paddingRight: 8}}>
            <View style={{height: 8}} />
            <Text style={declBodyStyle}>
              I hereby confirm that I do not wish to appoint any nominee(s) to my demat account/mutual fund folio at this
              point of time.
            </Text>
            <View style={{height: 12}} />
            <Text style={declBodyStyle}>I understand that -</Text>
            <View style={{height: 8}} />
            <DeclarationBullet
              index="i."
              text="The nomination helps to quickly identify the person for transfer of securities to my legal heir(s) by my demise."
            />
            <View style={{height: 8}} />
            <DeclarationBullet
              index="ii."
              text="In the absence of a nomination, my legal heir(s) may require the submission of certain additional legal or court-issued documents which may delay the process of transmission of securities to my legal heir(s)."
            />
            <View style={{height: 8}} />
            <DeclarationBullet
              index="iii."
              text="If no claim is made on the account/folio for a prolonged period after my demise, the holdings may be transferred to Investor Education and Protection Fund Authority (IEPF) in accordance with the applicable regulatory framework."
            />
            <View style={{height: 12}} />
            <Text style={declBodyStyle}>
              I confirm that I have understood the above implications and that my decision to opt out of nomination is
              voluntary.
            </Text>
          </ScrollView>
          <View style={{height: 16}} />
          <View style={{paddingRight: 8}}>
            <Pressable
              onPress={onClose}
              style={{
                alignSelf: 'stretch',
                minHeight: 48,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: KycTheme.radiusSm,
                backgroundColor: KycTheme.buttonEnabledPurple,
              }}>
              <Text style={{fontSize: 15, fontWeight: '600', color: '#FFFFFF'}}>I Understand</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Styled "+ Add Nominee (optional)" for `add_2_nominee` / `add_4_nominee` etc. */
export function NomineeOptionalAddCheckboxButton({onTap}: {onTap: () => void}) {
  return (
    <View style={{paddingBottom: 12}}>
      <DashedActionCard onTap={onTap}>
        <Text style={{fontSize: KycTheme.fontSizeBodyLg, fontWeight: '700', color: KycTheme.primary}}>
          {'+ Add Nominee'}
          <Text style={{fontSize: KycTheme.fontSizeCaption, fontWeight: '500', color: KycTheme.textSecondary}}>
            {' (optional)'}
          </Text>
        </Text>
      </DashedActionCard>
    </View>
  );
}

/** Landing UI when user has not chosen to add a nominee. */
export function NomineeOptOutLanding({
  checked,
  onToggle,
  onDeclarationTap,
}: {
  checked: boolean;
  onToggle: () => void;
  onDeclarationTap: () => void;
}) {
  // The Declaration link sits inside the tappable card; tapping it must not toggle the checkbox.
  const ignoreCardTap = useRef(false);
  return (
    <View style={{alignItems: 'flex-start', alignSelf: 'stretch'}}>
      <Text style={{fontSize: 20, fontWeight: '700', color: KycTheme.textPrimary}}>Add Nominee</Text>
      <View style={{height: 8}} />
      <Text
        style={{
          fontSize: KycTheme.fontSizeBody,
          fontWeight: '400',
          color: KycTheme.textSecondary,
          lineHeight: KycTheme.fontSizeBody * 1.4,
        }}>
        Do you want to Add Nominee (Optional)?
      </Text>
      <View style={{height: 16}} />
      <Pressable
        onPress={() => {
          if (ignoreCardTap.current) {
            ignoreCardTap.current = false;
            return;
          }
          onToggle();
        }}
        style={{
          alignSelf: 'stretch',
          backgroundColor: KycTheme.background,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: KycTheme.border,
          padding: 16,
          flexDirection: 'row',
          alignItems: 'flex-start',
        }}>
        <View style={{paddingTop: 1, width: 22, height: 22}} pointerEvents="none">
          <KycCheckbox value={checked} size={18} borderColor={KycTheme.border} borderWidth={1.6} />
        </View>
        <View style={{width: 10}} />
        <View style={{flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center'}}>
          <Text style={{fontSize: 13, lineHeight: 13 * 1.5, color: '#334155'}}>
            {'I am opting out of adding nominee at this time and can add them later (optional). '}
          </Text>
          <Pressable
            onPressIn={() => {
              ignoreCardTap.current = true;
            }}
            onPress={() => {
              onDeclarationTap();
              setTimeout(() => {
                ignoreCardTap.current = false;
              }, 0);
            }}
            style={{paddingVertical: 2}}>
            <Text
              style={{
                fontSize: 13,
                lineHeight: 13 * 1.5,
                color: KycTheme.primary,
                fontWeight: '600',
                textDecorationLine: 'underline',
                textDecorationColor: KycTheme.primary,
              }}>
              Declaration
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

/** Whether a field belongs in the nominee block (not toggle / consent / backend). */
export function isNomineeFormContentField(name: string): boolean {
  if (isNomineeAddNomineeDropdownField(name)) return false;
  if (isNomineeOptOutConsentField(name)) return false;
  if (isNomineeBackendOnlyField(name)) return false;
  return true;
}

/** Hide styled add checkbox once the user has opened that nominee slot. */
export function shouldRenderStyledAddCheckbox(opts: {name: string; formData: AnyMap}): boolean {
  if (!isNomineeStyledAddCheckboxField(opts.name)) return false;
  return !isCheckboxCheckedValue(opts.formData[opts.name]);
}

/** Namespace-style export mirroring the Dart static class `NomineeStepSection`. */
export const NomineeStepSection = {
  primaryToggle: NomineePrimaryToggle,
  maxNomineesHint: NomineeMaxNomineesHint,
  optOutLanding: NomineeOptOutLanding,
  optionalAddCheckboxButton: NomineeOptionalAddCheckboxButton,
  isNomineeFormContentField,
  shouldRenderStyledAddCheckbox,
};
