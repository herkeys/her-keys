/**
 * TEST-ONLY `react-native` for the Weather card: the shared stub plus a scriptable AppState (tests fire `active`), an Image, and a
 * Linking that records `openSettings` / `openURL` instead of leaving the process.
 */
export * from '../../support/rn-stub.tsx';
import React from 'react';

export const appStateHandlers = [];
export const AppState = {
  addEventListener(_event, handler) {
    appStateHandlers.push(handler);
    return {
      remove() {
        const at = appStateHandlers.indexOf(handler);
        if (at >= 0) appStateHandlers.splice(at, 1);
      },
    };
  },
};

export const linkingCalls = [];
export const Linking = {
  async openSettings() {
    linkingCalls.push('openSettings');
  },
  async openURL(url) {
    linkingCalls.push(`openURL:${url}`);
  },
};

export const Image = (props) => React.createElement('Image', props);
