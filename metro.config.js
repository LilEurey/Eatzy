const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Expo's Metro watcher registers `*.local` / `*.env` / `*.development` as
// transformable source extensions (watcher.additionalExts). Standard
// `@expo/env` filenames get dedicated handling, but our parked local-stack
// creds file `.env.stack.local` doesn't — Metro feeds it straight to Babel,
// which fails to parse the leading `#` comment. Keep it out of the graph.
const existingBlockList = config.resolver.blockList
  ? Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  : [];
config.resolver.blockList = [...existingBlockList, /\.env\.stack\.local$/];

module.exports = withNativeWind(config, { input: './src/global.css' });
