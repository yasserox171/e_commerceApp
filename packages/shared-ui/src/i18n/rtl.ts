import { I18nManager } from 'react-native';

/**
 * Both apps are Arabic-first, so RTL is not a user preference — it is the
 * layout. Two things have to be true for React Native to mirror flexbox:
 *
 *   1. `allowRTL(true)` + `forceRTL(true)` at the native level.
 *   2. The process has restarted since that flag was written.
 *
 * The flag is persisted natively, so a production build launched from a cold
 * start is already RTL. Only the very first launch after an install (or a
 * development reload) can see it flip, which is what `needsRestart` reports.
 *
 * Call this at module scope in the app entry, BEFORE the first render.
 */
export function enableRTL(): { isRTL: boolean; needsRestart: boolean } {
  I18nManager.allowRTL(true);

  if (!I18nManager.isRTL) {
    I18nManager.forceRTL(true);
    // The flag is set but this JS bundle is already laid out LTR.
    return { isRTL: false, needsRestart: true };
  }

  I18nManager.forceRTL(true);
  return { isRTL: true, needsRestart: false };
}

export const isRTL = (): boolean => I18nManager.isRTL;

/**
 * `flexDirection: 'row'` already flips under RTL. These helpers are for the
 * cases it does not cover — an icon that must always point at the start of the
 * line, or a chevron that should mirror.
 */
export const rtl = {
  /** Chevron that means "forward" in reading order. */
  forwardChevron: (): 'chevron-back' | 'chevron-forward' =>
    I18nManager.isRTL ? 'chevron-back' : 'chevron-forward',

  /** Multiplier for translate animations so they move toward the start edge. */
  directionMultiplier: (): 1 | -1 => (I18nManager.isRTL ? -1 : 1),

  /** `textAlign` for body copy — explicit beats relying on the default. */
  textAlign: (): 'right' | 'left' => (I18nManager.isRTL ? 'right' : 'left'),

  /** Opposite edge, for things like a price pinned against the text. */
  textAlignOpposite: (): 'right' | 'left' => (I18nManager.isRTL ? 'left' : 'right'),
};
