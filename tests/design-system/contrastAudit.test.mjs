/**
 * The rendered-contrast audit must itself be trustworthy: it has to FIND a bad pairing, honour the real background behind a
 * node, exempt the documented disabled pair, and skip translucent layers rather than guess.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { describe, test } from 'node:test';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auditContrast } from '../support/contrastAudit.ts';
import { render } from '../support/render.tsx';
import { color } from '../../src/design/tokens.ts';

describe('rendered contrast audit', () => {
  test('finds Berry text on a Soft Lilac fill (4.16:1) and names the pair', async () => {
    const r = await render(<View style={{ backgroundColor: color.surface.tint }}><Text style={{ color: color.action.primary, fontSize: 11 }}>HOW IT WORKS</Text></View>);
    const { findings } = auditContrast(r.root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].fg, color.action.primary);
    assert.equal(findings[0].bg, color.surface.tint);
    assert.ok(findings[0].ratio < 4.5 && findings[0].ratio > 4);
  });

  test('passes the lilac-legal Berry-family token on the same fill', async () => {
    const r = await render(<View style={{ backgroundColor: color.surface.tint }}><Text style={{ color: color.action.onSoft, fontSize: 11 }}>HOW IT WORKS</Text></View>);
    assert.equal(auditContrast(r.root).findings.length, 0);
  });

  test('uses the NEAREST opaque background, not the page', async () => {
    const r = await render(
      <View style={{ backgroundColor: color.surface.tint }}>
        <View style={{ backgroundColor: color.surface.primary }}><Text style={{ color: color.action.primary }}>on white is fine</Text></View>
      </View>,
    );
    assert.equal(auditContrast(r.root).findings.length, 0);
  });

  test('large text uses the 3:1 floor; icons use 3:1', async () => {
    const r = await render(
      <View style={{ backgroundColor: color.surface.tint }}>
        <Text style={{ color: color.action.primary, fontSize: 24, fontWeight: '600' }}>Big headline</Text>
        <Ionicons name="key-outline" size={24} color={color.action.primary} />
      </View>,
    );
    assert.equal(auditContrast(r.root).findings.length, 0, 'Berry on Lilac is 4.16:1 — fine for large text and graphics');
  });

  test('exempts the documented disabled pair and skips translucent layers instead of guessing', async () => {
    const r = await render(
      <View>
        <View style={{ backgroundColor: color.action.disabled }}><Text style={{ color: color.action.disabledText }}>Disabled</Text></View>
        <View style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}><Text style={{ color: '#FFFFFF', fontSize: 11 }}>scrim</Text></View>
      </View>,
    );
    const result = auditContrast(r.root);
    assert.equal(result.findings.length, 0);
    assert.equal(result.skippedTranslucent, 1);
  });
});
