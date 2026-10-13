import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { Platform, StyleSheet } from 'react-native';
import { Button } from '../../src/design/components/Button.tsx';
import { render } from '../support/render.tsx';

// Native layout/TalkBack are NOT proved by this renderer. This checks the minimum target contract
// handed to RN, and preserves existing iOS/web sizing and button intent.
for (const [platform, expectedSmall] of [['android', 48], ['ios', 44], ['web', 44]]) {
  test(`B2B-A02: ${platform} button target and handler contract`, async () => {
    const previous = Platform.OS;
    Platform.OS = platform;
    try {
      for (const size of ['sm', 'md']) {
        let calls = 0;
        const r = await render(<Button label="Up" size={size} onPress={() => calls++} />);
        const target = r.root.findByType('Pressable');
        assert.equal(StyleSheet.flatten(target.props.style).minHeight, size === 'sm' ? expectedSmall : 48);
        assert.equal(target.props.accessibilityRole, 'button');
        assert.equal(target.props.accessibilityLabel, 'Up');
        await TestRenderer.act(async () => target.props.onPress());
        assert.equal(calls, 1);
        await TestRenderer.act(async () => r.update(<Button label="Up" size={size} disabled onPress={() => calls++} />));
        assert.equal(r.root.findByType('Pressable').props.disabled, true);
        assert.equal(r.root.findByType('Pressable').props.accessibilityState.disabled, true);
        await TestRenderer.act(async () => r.unmount());
      }
    } finally {
      Platform.OS = previous;
    }
  });
}
