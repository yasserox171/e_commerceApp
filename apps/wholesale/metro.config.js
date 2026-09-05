// Learn more: https://docs.expo.dev/guides/monorepo/
const { getDefaultConfig } = require('expo/metro-config');
const Module = require('node:module');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');

// ---------------------------------------------------------------------------
// Web-only upstream workaround.
//
// @expo/cli 57 builds the web polyfill list with
// `require('react-native/rn-get-polyfills')`. react-native 0.87 dropped that
// file and does not expose the subpath through its `exports` map, and the CLI
// only swallows MODULE_NOT_FOUND — so ERR_PACKAGE_PATH_NOT_EXPORTED escapes and
// every `expo start --web` / `expo export -p web` bundle fails.
//
// The entry point was only ever a re-export of @react-native/js-polyfills, so
// point Node's resolver at that instead. Patching here rather than in
// `config.serializer.getPolyfills` because the CLI applies its own serializer
// wrapper after this file is loaded, and would overwrite ours.
//
// Native builds never reach this branch. Remove once @expo/cli also catches
// ERR_PACKAGE_PATH_NOT_EXPORTED.
// ---------------------------------------------------------------------------
const RN_POLYFILL_ENTRY = 'react-native/rn-get-polyfills';
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function patchedResolve(request, ...rest) {
  if (request === RN_POLYFILL_ENTRY) {
    return originalResolveFilename.call(this, '@react-native/js-polyfills', ...rest);
  }
  return originalResolveFilename.call(this, request, ...rest);
};

const config = getDefaultConfig(projectRoot);

// @ecommerce/shared-ui is consumed as TypeScript source, so Metro has to watch
// the whole workspace — not just this app — or edits there never trigger a
// refresh and imports resolve to nothing.
config.watchFolders = [workspaceRoot];

// Resolve from the app first, then the hoisted workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Hierarchical lookup stays ON. npm does not hoist everything — expo keeps
// expo-modules-core under node_modules/expo/node_modules — and disabling the
// walk-up makes those nested dependencies unresolvable.

module.exports = config;
