import React from 'react';
import { StyleSheet, Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { rtl } from '../i18n/rtl';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors, TypographyToken } from '../theme/tokens';

export interface TextProps extends RNTextProps {
  variant?: TypographyToken;
  color?: keyof ThemeColors | (string & {});
  align?: TextStyle['textAlign'];
  /** Shorthand for the common "muted caption" pairing. */
  muted?: boolean;
}

/**
 * Every string in both apps renders through this. It applies the Cairo family,
 * the RTL-correct default alignment, and a theme colour — so no screen has to
 * remember to do any of the three.
 */
export function Text({
  variant = 'body',
  color,
  align,
  muted = false,
  style,
  ...props
}: TextProps) {
  const theme = useTheme();

  const resolvedColor =
    color && color in theme.colors
      ? theme.colors[color as keyof ThemeColors]
      : (color ?? (muted ? theme.colors.textMuted : theme.colors.text));

  return (
    <RNText
      {...props}
      style={StyleSheet.flatten([
        theme.typography[variant],
        { color: resolvedColor, textAlign: align ?? rtl.textAlign() },
        // Arabic glyphs sit lower in the em box; without this the text looks
        // top-heavy inside fixed-height rows.
        { includeFontPadding: false } as TextStyle,
        style,
      ])}
    />
  );
}
