import React from 'react';
import {Text, View} from 'react-native';
import {KycTheme, withOpacity} from '../theme/kycTheme';

interface KycNoteBoxProps {
  text: string;
  linkText?: string | null;
  onLinkTap?: (() => void) | null;
}

/** Default Aadhaar note from Figma */
export const kAadhaarNote =
  'Note: Online account opening requires your number to be linked with Aadhaar. ' +
  'You can check if your mobile number is linked to Aadhaar here. ' +
  "If your mobile number isn't linked to Aadhaar, please open your account offline.";

/** Note box from Figma (e.g. Aadhaar linking note on Start your KYC / OTP screens) */
function KycNoteBoxImpl({text, linkText, onLinkTap}: KycNoteBoxProps) {
  const hasLink = linkText != null && onLinkTap != null;
  const textStyle = {
    fontSize: KycTheme.fontSizeBody,
    color: KycTheme.textPrimary,
    lineHeight: KycTheme.fontSizeBody * 1.4,
  };
  return (
    <View
      style={{
        alignSelf: 'stretch',
        padding: KycTheme.spacingLg,
        backgroundColor: withOpacity(KycTheme.primary, 0.06),
        borderRadius: KycTheme.radiusMd,
        borderWidth: 1,
        borderColor: withOpacity(KycTheme.primary, 0.2),
      }}>
      {hasLink ? (
        <Text style={textStyle}>
          {text}
          <Text
            onPress={onLinkTap ?? undefined}
            style={{color: KycTheme.primary, fontWeight: '600', textDecorationLine: 'underline'}}>
            {` ${linkText}`}
          </Text>
        </Text>
      ) : (
        <Text style={textStyle}>{text}</Text>
      )}
    </View>
  );
}

export const KycNoteBox = Object.assign(KycNoteBoxImpl, {aadhaarNote: kAadhaarNote});
