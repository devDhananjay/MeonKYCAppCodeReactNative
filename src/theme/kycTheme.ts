import {ViewStyle} from 'react-native';

/**
 * Design tokens from Figma (STOXBOX KYC)
 * Ref: https://www.figma.com/design/w5QdcmzaPUF1ZfruqPgaPV/Stoxbox
 * Port of lib/theme/kyc_theme.dart
 */
export const KycTheme = {
  // Primary purple (Figma buttons / accents)
  primary: '#6B21A8',
  primaryDark: '#581C87',
  primaryLight: '#7C3AED',

  // Header & Send OTP button (spec)
  headerDarkPurple: '#6B21A8',
  buttonEnabledPurple: '#6C5CE7',
  buttonDisabledPurple: '#D5CFF5',

  // Neutrals
  background: '#F8FAFC',
  surface: '#FFFFFF',
  textPrimary: '#1E293B',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  success: '#22C55E',
  white: '#FFFFFF',
  black: '#000000',
  red: '#F44336',
  transparent: 'transparent',

  // Figma-aligned spacing (8px grid)
  spacingXs: 4,
  spacingSm: 8,
  spacingMd: 12,
  spacingLg: 16,
  spacingXl: 20,
  spacing2xl: 24,
  spacing3xl: 32,

  // Figma-aligned radius
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 16,

  // Figma typography (step titles / body)
  fontSizeCaption: 12,
  fontSizeBody: 14,
  fontSizeBodyLg: 16,
  fontSizeTitleSm: 18,
  fontSizeTitle: 22,
  fontSizeHero: 24,

  // Card shadow (Figma-style subtle)
  cardShadow: {
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
    elevation: 3,
  } as ViewStyle,
  cardShadowSm: {
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  } as ViewStyle,

  // Status bar style
  statusBar: {
    barStyle: 'dark-content' as const,
    backgroundColor: 'transparent',
  },

  // Input decoration theme
  input: {
    borderRadius: 12,
    borderColor: '#E2E8F0',
    focusedBorderColor: '#6B21A8',
    focusedBorderWidth: 2,
    errorBorderColor: '#F44336',
    paddingHorizontal: 16,
    paddingVertical: 14,
    hintColor: '#64748B',
    hintFontSize: 16,
  },

  // Elevated button theme
  button: {
    backgroundColor: '#6B21A8',
    color: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    fontSize: 16,
    fontWeight: '600' as const,
  },
};

/** Subset of Flutter's Material palette used by the app. */
export const MaterialColors = {
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  red: '#F44336',
  redShade50: '#FFEBEE',
  redShade100: '#FFCDD2',
  redShade200: '#EF9A9A',
  redShade300: '#E57373',
  redShade400: '#EF5350',
  redShade600: '#E53935',
  redShade700: '#D32F2F',
  redShade800: '#C62828',
  redShade900: '#B71C1C',
  orange: '#FF9800',
  orangeShade50: '#FFF3E0',
  orangeShade100: '#FFE0B2',
  orangeShade200: '#FFCC80',
  orangeShade300: '#FFB74D',
  orangeShade700: '#F57C00',
  orangeShade800: '#EF6C00',
  orangeShade900: '#E65100',
  green: '#4CAF50',
  greenShade50: '#E8F5E9',
  greenShade100: '#C8E6C9',
  greenShade600: '#43A047',
  greenShade700: '#388E3C',
  greenShade800: '#2E7D32',
  blue: '#2196F3',
  blueShade50: '#E3F2FD',
  blueShade700: '#1976D2',
  grey: '#9E9E9E',
  greyShade50: '#FAFAFA',
  greyShade100: '#F5F5F5',
  greyShade200: '#EEEEEE',
  greyShade300: '#E0E0E0',
  greyShade400: '#BDBDBD',
  greyShade500: '#9E9E9E',
  greyShade600: '#757575',
  greyShade700: '#616161',
  greyShade800: '#424242',
  greyShade900: '#212121',
  amber: '#FFC107',
  amberShade700: '#FFA000',
  amberShade800: '#FF8F00',
  deepPurple: '#673AB7',
  purple: '#9C27B0',
  black87: 'rgba(0,0,0,0.87)',
  black54: 'rgba(0,0,0,0.54)',
  black45: 'rgba(0,0,0,0.45)',
  black38: 'rgba(0,0,0,0.38)',
  black26: 'rgba(0,0,0,0.26)',
  black12: 'rgba(0,0,0,0.12)',
  white70: 'rgba(255,255,255,0.7)',
};

/** Color.withOpacity helper for hex colors. */
export function withOpacity(hex: string, opacity: number): string {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map(c => c + c)
          .join('')
      : h.substring(h.length - 6);
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}
