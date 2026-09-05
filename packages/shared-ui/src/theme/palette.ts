/**
 * Moroccan warm identity, shared by both apps.
 *
 * Two anchors carry the brand: terracotta (زليج / طين) and Majorelle blue —
 * the pairing you see on Moroccan tilework. Each app promotes a different one
 * to primary so they read as siblings rather than clones:
 *
 *   9ri3a espress (retail)   → terracotta primary, Majorelle accent
 *   9ri3a         (wholesale)→ Majorelle primary, terracotta accent
 *
 * Everything else — sand backgrounds, ink text, semantic states — is identical.
 */

export const brand = {
  terracotta: {
    50: '#FEF4EE',
    100: '#FDE4D3',
    200: '#FBC7A7',
    300: '#F7A171',
    400: '#F2743C',
    500: '#E85D1F',
    600: '#C2410C',
    700: '#9A3412',
    800: '#7C2D12',
    900: '#652310',
  },
  majorelle: {
    50: '#EFF4FF',
    100: '#DBE6FE',
    200: '#BFD3FE',
    300: '#93B4FD',
    400: '#608DFA',
    500: '#3B6AF6',
    600: '#1D4ED8',
    700: '#1E40AF',
    800: '#1E3A8A',
    900: '#172B63',
  },
  sand: {
    50: '#FDFCFA',
    100: '#FAF7F2',
    200: '#F5F0E8',
    300: '#EDE5D8',
    400: '#E7E1D8',
    500: '#D6CCBC',
  },
  ink: {
    50: '#FAFAF9',
    100: '#F5F5F4',
    200: '#E7E5E4',
    300: '#D6D3D1',
    400: '#A8A29E',
    500: '#78716C',
    600: '#57534E',
    700: '#44403C',
    800: '#292524',
    900: '#1C1917',
    950: '#141210',
  },
  saffron: '#D97706',
  mint: '#15803D',
  ruby: '#B91C1C',
} as const;

export type BrandKey = keyof typeof brand;
