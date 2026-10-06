import React from 'react';
import {Pressable, StyleProp, Text, TextStyle, View, ViewStyle} from 'react-native';
import {KycTheme} from '../theme/kycTheme';
import {MaterialIcon} from './MaterialIcon';

/** Material 3 `onSurface` for the app's seeded colour scheme (approximation of ColorScheme.fromSeed). */
const onSurface = '#1D1B20';
const onSurface12 = 'rgba(29,27,32,0.12)';
const onSurface38 = 'rgba(29,27,32,0.38)';

export interface MaterialButtonProps {
  onPress?: (() => void) | null;
  /** Text label (inherits the theme text style: 16 / w600). */
  label?: string;
  /** Overrides merged on top of the default label style (Flutter `Text(style: ...)`). */
  labelStyle?: TextStyle;
  /** Custom content (replaces [label]). Text children must set their own colour. */
  children?: React.ReactNode;
  backgroundColor?: string;
  foregroundColor?: string;
  disabledBackgroundColor?: string;
  disabledForegroundColor?: string;
  paddingVertical?: number;
  paddingHorizontal?: number;
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  minWidth?: number | string;
  minHeight?: number;
  /** Stretch to parent width (Flutter `SizedBox(width: double.infinity)` / minimumSize.width = infinity). */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Flutter `ElevatedButton` with this app's `KycTheme.theme.elevatedButtonTheme`
 * (primary bg, white fg, elevation 0, padding 16x24, radius 12, text 16/600).
 */
export function ElevatedButton({
  onPress,
  label,
  labelStyle,
  children,
  backgroundColor = KycTheme.primary,
  foregroundColor = '#FFFFFF',
  disabledBackgroundColor = onSurface12,
  disabledForegroundColor = onSurface38,
  paddingVertical = 16,
  paddingHorizontal = 24,
  borderRadius = 12,
  borderColor,
  borderWidth,
  minWidth,
  minHeight = 40,
  fullWidth = false,
  style,
}: MaterialButtonProps) {
  const disabled = onPress == null;
  const fg = disabled ? disabledForegroundColor : foregroundColor;
  return (
    <Pressable
      disabled={disabled}
      onPress={() => onPress?.()}
      style={({pressed}) => [
        {
          backgroundColor: disabled ? disabledBackgroundColor : backgroundColor,
          paddingVertical,
          paddingHorizontal,
          borderRadius,
          borderColor,
          borderWidth,
          minWidth: minWidth as any,
          minHeight,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: pressed && !disabled ? 0.85 : 1,
        },
        style,
      ]}>
      {children != null ? (
        children
      ) : (
        <Text style={{fontSize: 16, fontWeight: '600', color: fg, textAlign: 'center', ...labelStyle}}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Flutter `OutlinedButton` with this app's outlinedButtonTheme (primary fg + border, radius 12, 16x24). */
export function OutlinedButton({
  onPress,
  label,
  labelStyle,
  children,
  foregroundColor = KycTheme.primary,
  borderColor,
  paddingVertical = 16,
  paddingHorizontal = 24,
  borderRadius = 12,
  fullWidth = false,
  minHeight = 40,
  style,
}: MaterialButtonProps) {
  const disabled = onPress == null;
  const fg = disabled ? onSurface38 : foregroundColor;
  return (
    <Pressable
      disabled={disabled}
      onPress={() => onPress?.()}
      style={({pressed}) => [
        {
          borderWidth: 1,
          borderColor: disabled ? onSurface12 : borderColor ?? KycTheme.primary,
          paddingVertical,
          paddingHorizontal,
          borderRadius,
          minHeight,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: pressed && !disabled ? 0.7 : 1,
        },
        style,
      ]}>
      {children != null ? (
        children
      ) : (
        <Text style={{fontSize: 14, fontWeight: '500', color: fg, textAlign: 'center', ...labelStyle}}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Flutter `TextButton` (no background; label in [foregroundColor], default primary). */
export function TextButton({
  onPress,
  label,
  labelStyle,
  children,
  foregroundColor = KycTheme.primary,
  paddingVertical = 0,
  paddingHorizontal = 0,
  style,
}: MaterialButtonProps) {
  const disabled = onPress == null;
  return (
    <Pressable
      disabled={disabled}
      onPress={() => onPress?.()}
      style={({pressed}) => [
        {paddingVertical, paddingHorizontal, opacity: pressed && !disabled ? 0.6 : 1},
        style,
      ]}>
      {children != null ? (
        children
      ) : (
        <Text
          style={{
            fontSize: 14,
            fontWeight: '500',
            color: disabled ? onSurface38 : foregroundColor,
            ...labelStyle,
          }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

interface KycCheckboxProps {
  value: boolean;
  onChanged?: ((v: boolean) => void) | null;
  size?: number;
  borderColor?: string;
  borderWidth?: number;
  activeColor?: string;
  disabled?: boolean;
}

/**
 * Flutter `Checkbox` with `KycTheme.theme.checkboxTheme`
 * (selected -> primary fill, white check, 4px radius, transparent when unselected).
 */
export function KycCheckbox({
  value,
  onChanged,
  size = 18,
  borderColor = onSurface,
  borderWidth = 2,
  activeColor = KycTheme.primary,
  disabled = false,
}: KycCheckboxProps) {
  const body = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        borderWidth: value ? 0 : borderWidth,
        borderColor,
        backgroundColor: value ? activeColor : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}>
      {value ? <MaterialIcon name="check" size={size - 2} color="#FFFFFF" /> : null}
    </View>
  );
  if (onChanged == null || disabled) return body;
  return (
    <Pressable onPress={() => onChanged(!value)} hitSlop={8}>
      {body}
    </Pressable>
  );
}
