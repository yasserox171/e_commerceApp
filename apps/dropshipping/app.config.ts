import type { ExpoConfig } from 'expo/config';

/**
 * 9ri3a espress — the consumer (dropshipping) app.
 *
 * Leads with terracotta where the wholesale app leads with Majorelle blue.
 *
 * The `scheme` below is what the payment gateway redirects back to after a
 * card payment, and must match CHECKOUT_RETURN_SCHEME in the API environment.
 */
const BRAND_TERRACOTTA = '#C2410C';
const SAND = '#FAF7F2';
const INK = '#141210';

const config: ExpoConfig = {
  name: '9ri3a espress',
  slug: 'qri3a-express',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'qri3aespress',
  userInterfaceStyle: 'automatic',

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'ma.qri3a.express',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  android: {
    package: 'ma.qri3a.express',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: BRAND_TERRACOTTA,
    },
  },

  web: {
    bundler: 'metro',
    // 'single' (client-rendered SPA), not 'static': these screens are all
    // auth-gated and API-driven, so server rendering buys nothing, and the
    // static renderer pulls react-native/rn-get-polyfills, a subpath RN 0.87
    // no longer exposes through its exports map.
    output: 'single',
    favicon: './assets/favicon.png',
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: SAND,
        dark: { backgroundColor: INK },
      },
    ],
    [
      // Native RTL from the first launch — no restart prompt on install.
      'expo-localization',
      {
        supportsRTL: true,
        forcesRTL: true,
        supportedLocales: ['ar', 'fr'],
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? '',
    },
  },
};

export default config;
