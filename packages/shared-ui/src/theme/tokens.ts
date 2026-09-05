import { Platform } from 'react-native';

import { brand } from './palette.js';

export type AppVariant = 'wholesale' | 'retail';
export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;

  accent: string;
  accentSoft: string;
  onAccent: string;

  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceSunken: string;

  text: string;
  textMuted: string;
  textSubtle: string;
  textInverse: string;

  border: string;
  borderStrong: string;

  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;

  skeleton: string;
  skeletonHighlight: string;
  overlay: string;
}

function lightColors(variant: AppVariant): ThemeColors {
  const isWholesale = variant === 'wholesale';
  const primaryRamp = isWholesale ? brand.majorelle : brand.terracotta;
  const accentRamp = isWholesale ? brand.terracotta : brand.majorelle;

  return {
    primary: primaryRamp[600],
    primaryPressed: primaryRamp[700],
    primarySoft: primaryRamp[50],
    onPrimary: '#FFFFFF',

    accent: accentRamp[600],
    accentSoft: accentRamp[50],
    onAccent: '#FFFFFF',

    background: brand.sand[100],
    surface: '#FFFFFF',
    surfaceAlt: brand.sand[50],
    surfaceSunken: brand.sand[200],

    text: brand.ink[900],
    textMuted: brand.ink[600],
    textSubtle: brand.ink[500],
    textInverse: '#FFFFFF',

    border: brand.sand[400],
    borderStrong: brand.sand[500],

    success: brand.mint,
    successSoft: '#E7F6EC',
    warning: brand.saffron,
    warningSoft: '#FEF3E2',
    danger: brand.ruby,
    dangerSoft: '#FDECEC',

    skeleton: brand.sand[300],
    skeletonHighlight: brand.sand[100],
    overlay: 'rgba(28, 25, 23, 0.45)',
  };
}

function darkColors(variant: AppVariant): ThemeColors {
  const isWholesale = variant === 'wholesale';
  const primaryRamp = isWholesale ? brand.majorelle : brand.terracotta;
  const accentRamp = isWholesale ? brand.terracotta : brand.majorelle;

  return {
    // Lighter steps of the same ramps: a 600 on a near-black ground fails
    // contrast, a 400 clears it while staying recognisably the brand colour.
    primary: primaryRamp[400],
    primaryPressed: primaryRamp[300],
    primarySoft: 'rgba(242, 116, 60, 0.14)',
    onPrimary: brand.ink[950],

    accent: accentRamp[400],
    accentSoft: 'rgba(96, 141, 250, 0.16)',
    onAccent: brand.ink[950],

    background: brand.ink[950],
    surface: '#1F1C1A',
    surfaceAlt: '#262220',
    surfaceSunken: '#171514',

    text: brand.ink[50],
    textMuted: brand.ink[300],
    textSubtle: brand.ink[400],
    textInverse: brand.ink[950],

    border: '#38322E',
    borderStrong: '#4A423C',

    success: '#4ADE80',
    successSoft: 'rgba(74, 222, 128, 0.14)',
    warning: '#FBBF24',
    warningSoft: 'rgba(251, 191, 36, 0.14)',
    danger: '#F87171',
    dangerSoft: 'rgba(248, 113, 113, 0.14)',

    skeleton: '#2B2724',
    skeletonHighlight: '#3A3532',
    overlay: 'rgba(0, 0, 0, 0.6)',
  };
}

/** 4pt scale — everything in the apps snaps to it. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

/**
 * Cairo covers Arabic and Latin in one family, so a price in Western digits
 * next to an Arabic title shares a baseline instead of looking pasted in.
 * The `-Regular`/`-Bold` names are what `useFonts` registers them under.
 */
export const fontFamily = {
  regular: 'Cairo_400Regular',
  medium: 'Cairo_500Medium',
  semibold: 'Cairo_600SemiBold',
  bold: 'Cairo_700Bold',
} as const;

export interface TextStyleToken {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
}

/**
 * Arabic script needs more leading than Latin at the same size — the default
 * 1.2× ratio clips descenders on letters like ج and ع.
 */
export const typography = {
  display: { fontFamily: fontFamily.bold, fontSize: 30, lineHeight: 42 },
  h1: { fontFamily: fontFamily.bold, fontSize: 24, lineHeight: 36 },
  h2: { fontFamily: fontFamily.semibold, fontSize: 20, lineHeight: 30 },
  h3: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 26 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 25 },
  bodyStrong: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 25 },
  callout: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 22 },
  caption: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 20 },
  micro: { fontFamily: fontFamily.medium, fontSize: 11, lineHeight: 16 },
  price: { fontFamily: fontFamily.bold, fontSize: 18, lineHeight: 26 },
  priceLarge: { fontFamily: fontFamily.bold, fontSize: 26, lineHeight: 36 },
} as const satisfies Record<string, TextStyleToken>;

export type TypographyToken = keyof typeof typography;

export interface ShadowToken {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

/**
 * Soft, low-contrast elevation. 2026 product cards sit on the page rather than
 * float above it, so these stay subtle — and disappear entirely in dark mode,
 * where a lighter surface reads as elevation instead.
 */
export function shadows(scheme: ColorScheme) {
  const shadowColor = scheme === 'dark' ? '#000000' : brand.ink[900];
  const opacity = scheme === 'dark' ? 0.4 : 1;

  const make = (height: number, radiusValue: number, alpha: number, elevation: number): ShadowToken => ({
    shadowColor,
    shadowOffset: { width: 0, height },
    shadowOpacity: alpha * opacity,
    shadowRadius: radiusValue,
    elevation,
  });

  return {
    none: make(0, 0, 0, 0),
    xs: make(1, 2, 0.04, 1),
    sm: make(2, 6, 0.06, 2),
    md: make(4, 12, 0.08, 4),
    lg: make(10, 24, 0.1, 8),
  } as const;
}

/** Durations tuned so a tap feels answered without the UI feeling springy. */
export const motion = {
  instant: 90,
  fast: 160,
  base: 240,
  slow: 360,
  // iOS gets a real spring; on Android the elevation change already reads as
  // feedback and a spring on top looks wobbly.
  pressScale: Platform.select({ ios: 0.97, default: 0.98 }) as number,
} as const;

export interface Theme {
  variant: AppVariant;
  scheme: ColorScheme;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  fontFamily: typeof fontFamily;
  shadows: ReturnType<typeof shadows>;
  motion: typeof motion;
}

export function buildTheme(variant: AppVariant, scheme: ColorScheme): Theme {
  return {
    variant,
    scheme,
    colors: scheme === 'dark' ? darkColors(variant) : lightColors(variant),
    spacing,
    radius,
    typography,
    fontFamily,
    shadows: shadows(scheme),
    motion,
  };
}
