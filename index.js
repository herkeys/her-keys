// Side-effect initialization must run before Expo Router reads the initial URL.
const { installWebLinkGuard } = require('./src/platform/webLinkGuard');
if (installWebLinkGuard()) {
  require('expo-router/entry');
}
