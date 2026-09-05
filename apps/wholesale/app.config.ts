import type { ExpoConfig } from 'expo/config';

/**
 * 9ri3a — the wholesale app.
 *
 * Identity note: this app leads with Majorelle blue while 9ri3a espress leads
 * with terracotta. Both draw from the same palette in @ecommerce/shared-ui, so
 * they read as siblings on a home screen.
 */
const BRAND_BLUE = '#1D4ED8';
const SAND = '#FAF7F2';
const INK = '#141210';

const config: ExpoConfig = {
  name: '9ri3a',
  slug: 'qri3a-wholesale',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  // Deep-link scheme. Distinct from the retail app so both can be installed
  // side by side without the OS routing links to the wrong one.
  scheme: 'qri3a',
  userInterfaceStyle: 'automatic',

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'ma.qri3a.wholesale',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  android: {
    package: 'ma.qri3a.wholesale',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: BRAND_BLUE,
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
      // Sets RTL natively at build time, so the app is right-to-left from the
      // very first launch instead of needing a restart to flip.
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
    // Only present once the project is linked. `eas init` writes it here, and
    // the GitHub Actions APK build does not need it at all.
    ...(process.env.EAS_PROJECT_ID
      ? { eas: { projectId: process.env.EAS_PROJECT_ID } }
      : {}),
  },
};

export default config;
