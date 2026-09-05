// Learn more: https://docs.expo.dev/guides/monorepo/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');

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

// npm hoists most packages to the root; without this, two copies of React can
// end up in the bundle and hooks blow up with "invalid hook call".
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
