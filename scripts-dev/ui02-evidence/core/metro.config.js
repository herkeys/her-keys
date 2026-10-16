// TEMPORARY evidence config — copy to the repo root next to core-entry.js, never commit it there. See ../README.md.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const config = getDefaultConfig(__dirname);
const stubs = {
  'expo-router': 'scripts-dev/ui02-evidence/core/stubs/expo-router.js',
  'expo-notifications': 'scripts-dev/ui02-evidence/core/stubs/expo-notifications.js',
};
const original = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (stubs[moduleName]) return { type: 'sourceFile', filePath: path.join(__dirname, stubs[moduleName]) };
  return (original ?? context.resolveRequest)(context, moduleName, platform);
};
module.exports = config;
