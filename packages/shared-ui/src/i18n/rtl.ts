import { I18nManager, Platform } from 'react-native';

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
  I18nManager.forceRTL(true);

  // On web there is no native flag to persist: react-native-web reads
  // I18nManager for style flipping, but the document's own text direction is an
  // HTML attribute, and without it the browser lays paragraphs out LTR.
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.setAttribute('lang', 'ar');
    return { isRTL: true, needsRestart: false };
  }

  // Native: the flag is written, but this JS bundle is already laid out LTR if
  // it was not set when the process started.
  return { isRTL: I18nManager.isRTL, needsRestart: !I18nManager.isRTL };
}

/**
 * react-native-web's I18nManager is a stub whose `isRTL` stays false however it
 * is called, so on web the document's own `dir` is the only honest answer —
 * and it is what the browser actually laid the page out with.
 */
export const isRTL = (): boolean => {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return document.documentElement.getAttribute('dir') === 'rtl';
  }
  return I18nManager.isRTL;
};

/**
 * `flexDirection: 'row'` already flips under RTL. These helpers are for the
 * cases it does not cover — an icon that must always point at the start of the
 * line, or a chevron that should mirror.
 */
export const rtl = {
  /**
   * Disclosure indicator — "there is more this way", the arrow at the end of a
   * list row. It points along the reading direction, so it flips to `‹` in RTL.
   */
  forwardChevron: (): 'chevron-back' | 'chevron-forward' =>
    isRTL() ? 'chevron-back' : 'chevron-forward',

  /**
   * Back affordance in a navigation header. It points AGAINST the reading
   * direction — `‹` in LTR, `›` in RTL — matching how iOS and Android mirror
   * their own back chevrons. Not the same as `forwardChevron`, and using one
   * for the other leaves the back button pointing into the screen.
   */
  backChevron: (): 'chevron-back' | 'chevron-forward' =>
    isRTL() ? 'chevron-forward' : 'chevron-back',

  /** Multiplier for translate animations so they move toward the start edge. */
  directionMultiplier: (): 1 | -1 => (isRTL() ? -1 : 1),

  /** `textAlign` for body copy — explicit beats relying on the default. */
  textAlign: (): 'right' | 'left' => (isRTL() ? 'right' : 'left'),

  /** Opposite edge, for things like a price pinned against the text. */
  textAlignOpposite: (): 'right' | 'left' => (isRTL() ? 'left' : 'right'),
};
