import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, TextStyle, View, ViewStyle} from 'react-native';
import {KycTheme, withOpacity} from '../theme/kycTheme';
import {MaterialIcon, MaterialIconName} from './MaterialIcon';

/** Subset of Flutter's `ButtonStyle` that this app uses (`ElevatedButton.styleFrom`). */
export interface ButtonStyleLike {
  backgroundColor?: string;
  disabledBackgroundColor?: string;
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  paddingVertical?: number;
  paddingHorizontal?: number;
  elevation?: number;
}

interface LoadingButtonProps {
  /** Button label when not loading */
  label: string;
  /** Button label when loading (e.g., "Submitting...", "Processing...", "Verifying...") */
  loadingLabel?: string;
  /** Whether the button is currently loading */
  isLoading?: boolean;
  /** Callback when button is pressed (undefined when loading or disabled) */
  onPressed?: (() => void) | null;
  /** Custom styling */
  style?: ButtonStyleLike;
  /** Button width (default: match parent) */
  width?: number;
  /** Button height (default: 48) */
  height?: number;
  /** Icon to show before label (optional) */
  icon?: MaterialIconName;
  /** Text style for label */
  textStyle?: TextStyle;
  /** Loading spinner color (default: white) */
  spinnerColor?: string;
}

/** Reusable button that shows inline loading state without blocking the UI. */
export function LoadingButton({
  label,
  loadingLabel,
  isLoading = false,
  onPressed,
  style,
  width,
  height = 48,
  icon,
  textStyle,
  spinnerColor = '#FFFFFF',
}: LoadingButtonProps) {
  const disabled = isLoading || onPressed == null;
  const s: ButtonStyleLike = style ?? {
    backgroundColor: KycTheme.primary,
    disabledBackgroundColor: withOpacity(KycTheme.primary, 0.6),
    borderRadius: KycTheme.radiusMd,
    elevation: 0,
  };
  const bg = disabled ? s.disabledBackgroundColor ?? s.backgroundColor : s.backgroundColor;
  const containerStyle: ViewStyle = {
    width,
    height,
    backgroundColor: bg,
    borderRadius: s.borderRadius ?? 0,
    borderColor: s.borderColor,
    borderWidth: s.borderWidth,
    paddingVertical: s.paddingVertical,
    paddingHorizontal: s.paddingHorizontal,
    alignItems: 'center',
    justifyContent: 'center',
  };
  const labelStyle: TextStyle = textStyle ?? {color: '#FFFFFF', fontSize: 16, fontWeight: '600'};

  return (
    <Pressable
      disabled={disabled}
      onPress={() => onPressed?.()}
      style={({pressed}) => [containerStyle, pressed && !disabled ? {opacity: 0.85} : null]}>
      {isLoading ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={spinnerColor} />
          {loadingLabel != null ? (
            <>
              <View style={{width: 12}} />
              <Text style={labelStyle}>{loadingLabel}</Text>
            </>
          ) : null}
        </View>
      ) : (
        <View style={styles.row}>
          {icon != null ? (
            <>
              <MaterialIcon name={icon} color="#FFFFFF" size={20} />
              <View style={{width: 8}} />
            </>
          ) : null}
          <Text style={labelStyle}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

interface LoadingTextButtonProps {
  label: string;
  loadingLabel?: string;
  isLoading?: boolean;
  onPressed?: (() => void) | null;
  textStyle?: TextStyle;
  spinnerColor?: string;
}

/** Compact version of LoadingButton for inline actions (e.g., "Resend OTP") */
export function LoadingTextButton({
  label,
  loadingLabel,
  isLoading = false,
  onPressed,
  textStyle,
  spinnerColor,
}: LoadingTextButtonProps) {
  if (isLoading) {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={spinnerColor ?? KycTheme.primary} />
        {loadingLabel != null ? (
          <>
            <View style={{width: 8}} />
            <Text style={textStyle ?? {fontSize: 14, color: KycTheme.textSecondary, fontWeight: '500'}}>
              {loadingLabel}
            </Text>
          </>
        ) : null}
      </View>
    );
  }

  return (
    <Pressable disabled={onPressed == null} onPress={() => onPressed?.()}>
      <Text
        style={
          textStyle ?? {
            fontSize: 14,
            fontWeight: '600',
            color: KycTheme.primary,
            textDecorationLine: 'underline',
          }
        }>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
});
