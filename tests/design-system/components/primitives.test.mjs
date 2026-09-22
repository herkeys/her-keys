/**
 * Render/props contract tests for the canonical shared primitives
 * (HK-FE-UI-01 §12). Each primitive gets a render + props contract test;
 * interactive primitives additionally cover disabled/selected/pressed and
 * accessibility role/state; semantic components assert their treatment
 * derives from the allowed semantic input union, not arbitrary UI state.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { describe, test } from 'node:test';
import { StyleSheet } from 'react-native';
import {
  Button,
  Card,
  ChipToggle,
  Divider,
  EmptyState,
  ErrorState,
  InlineNotice,
  LoadingState,
  OfflineState,
  Screen,
  SegmentBar,
  StatusList,
  Tag,
  TextField,
  Sheet,
  ConfirmationSheet,
  Overline,
} from '../../../src/design/components/index.ts';
import { color, interaction, sizing } from '../../../src/design/tokens.ts';
import { render } from '../../support/render.tsx';

const flatten = (node) => StyleSheet.flatten(node.props.style) ?? {};

describe('Button', () => {
  test('renders label with button role and accessibility label', async () => {
    const r = await render(<Button label="Move it to tomorrow" onPress={() => {}} accessibilityHint="Approves the suggestion" />);
    const p = r.root.findByType('Pressable');
    assert.equal(p.props.accessibilityRole, 'button');
    assert.equal(p.props.accessibilityLabel, 'Move it to tomorrow');
    assert.equal(p.props.accessibilityHint, 'Approves the suggestion');
    assert.equal(r.root.findByType('Text').props.children, 'Move it to tomorrow');
  });

  test('disabled: real color pair, not opacity', async () => {
    const r = await render(<Button label="Continue" onPress={() => {}} disabled />);
    const p = r.root.findByType('Pressable');
    assert.equal(p.props.accessibilityState.disabled, true);
    assert.equal(p.props.disabled, true);
    const box = flatten(p);
    assert.equal(box.backgroundColor, color.action.disabled);
    assert.ok(!('opacity' in box), 'disabled must not be an opacity trick');
    const text = r.root.findByType('Text');
    assert.equal(flatten(text).color, color.action.disabledText);
  });

  test('variants resolve to token-derived treatments', async () => {
    const primary = await render(<Button label="A" onPress={() => {}} variant="primary" />);
    assert.equal(flatten(primary.root.findByType('Pressable')).backgroundColor, color.action.primary);
    assert.equal(flatten(primary.root.findByType('Text')).color, color.text.inverse);

    const secondary = await render(<Button label="B" onPress={() => {}} variant="secondary" />);
    assert.equal(flatten(secondary.root.findByType('Pressable')).borderColor, color.action.primaryBorder);
    assert.equal(flatten(secondary.root.findByType('Text')).color, color.action.primary);

    const ghost = await render(<Button label="C" onPress={() => {}} variant="ghost" />);
    assert.equal(flatten(ghost.root.findByType('Pressable')).backgroundColor, 'transparent');
  });

  test('sizes keep the touch floor', async () => {
    const sm = await render(<Button label="S" onPress={() => {}} size="sm" />);
    assert.ok(flatten(sm.root.findByType('Pressable')).minHeight >= sizing.minTouchTarget);
  });

  test('disabled ghost stays transparent', async () => {
    const r = await render(<Button label="G" onPress={() => {}} variant="ghost" disabled />);
    assert.equal(flatten(r.root.findByType('Pressable')).backgroundColor, 'transparent');
  });
});

describe('ChipToggle', () => {
  test('selected state derives from action tokens and exposes selected state', async () => {
    const r = await render(<ChipToggle label="Cooking" selected onPress={() => {}} />);
    const p = r.root.findByType('Pressable');
    assert.equal(p.props.accessibilityState.selected, true);
    const box = flatten(p);
    assert.equal(box.backgroundColor, color.action.primary);
    assert.equal(flatten(r.root.findByType('Text')).color, color.text.inverse);
  });

  test('unselected is a quiet surface', async () => {
    const r = await render(<ChipToggle label="Cooking" selected={false} onPress={() => {}} />);
    const box = flatten(r.root.findByType('Pressable'));
    assert.equal(box.backgroundColor, color.surface.primary);
    assert.equal(flatten(r.root.findByType('Text')).color, color.text.primary);
  });
});

describe('Tag', () => {
  test('every allowed tone maps to its semantic token family', async () => {
    const expected = {
      neutral: { fg: color.text.muted, bg: color.surface.secondary },
      attention: { fg: color.status.attention, bg: color.status.attentionSoft },
      success: { fg: color.status.success, bg: color.status.successSoft },
      accent: { fg: color.action.primary, bg: color.action.primarySoft },
    };
    for (const [tone, want] of Object.entries(expected)) {
      const r = await render(<Tag label={`tone-${tone}`} tone={tone} />);
      const box = flatten(r.root.findByType('View'));
      assert.equal(box.backgroundColor, want.bg, `${tone} background`);
      assert.equal(flatten(r.root.findByType('Text')).color, want.fg, `${tone} foreground`);
    }
  });

  test('label renders as uppercase status text', async () => {
    const r = await render(<Tag label="Possible pattern" tone="accent" />);
    assert.equal(r.root.findByType('Text').props.children, 'POSSIBLE PATTERN');
  });
});

describe('Card', () => {
  test('tones map to semantic families; raised adds elevation', async () => {
    const attention = await render(<Card tone="attention"><Tag label="x" /></Card>);
    assert.equal(flatten(attention.root.findByType('View')).backgroundColor, color.status.attentionSoft);

    const raised = await render(<Card raised><Tag label="x" /></Card>);
    const box = flatten(raised.root.findAllByType('View')[0]);
    assert.ok(box.shadowRadius > 0 || box.elevation > 0, 'raised applies elevation');
  });
});

describe('TextField', () => {
  test('label drives accessibilityLabel; error is text plus border, not color alone', async () => {
    const r = await render(
      <TextField label="First name" value="Maren" onChangeText={() => {}} error="Letters only, please" />,
    );
    const input = r.root.findByType('TextInput');
    assert.equal(input.props.accessibilityLabel, 'First name');
    const errorText = r.root.findAllByType('Text').find((t) => t.props.children === 'Letters only, please');
    assert.ok(errorText, 'error message rendered as text');
    assert.equal(flatten(errorText).color, color.status.attention);
  });

  test('uneditable is a declared state, not a visual shrug', async () => {
    const r = await render(<TextField label="Timezone" value="ET" onChangeText={() => {}} editable={false} />);
    const input = r.root.findByType('TextInput');
    assert.equal(input.props.editable, false);
    assert.equal(input.props.accessibilityState.disabled, true);
  });

  test('identifying border uses the control border token', async () => {
    const r = await render(<TextField label="Notes" value="" onChangeText={() => {}} />);
    assert.equal(flatten(r.root.findByType('TextInput')).borderColor, color.border.control);
  });
});

describe('Screen', () => {
  test('scrolls by default with safe-area edges and app background', async () => {
    const r = await render(<Screen><Tag label="x" /></Screen>);
    const safe = r.root.findByType('SafeAreaView');
    assert.deepEqual(safe.props.edges, ['top', 'left', 'right']);
    assert.equal(flatten(safe).backgroundColor, color.background);
    const scroll = r.root.findByType('ScrollView');
    assert.equal(scroll.props.showsVerticalScrollIndicator, false);
    assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
  });

  test('non-scroll variant renders a plain view', async () => {
    const r = await render(<Screen scroll={false}><Tag label="x" /></Screen>);
    assert.equal(r.root.findAllByType('ScrollView').length, 0);
  });
});

describe('SegmentBar', () => {
  test('renders exactly total segments, filling the first `filled`', async () => {
    const r = await render(<SegmentBar filled={2} total={4} />);
    const segs = r.root.findAllByType('View').filter((v) => flatten(v).height === 6);
    assert.equal(segs.length, 4);
    assert.equal(segs.filter((s) => flatten(s).backgroundColor === color.action.primary).length, 2);
    assert.equal(segs.filter((s) => flatten(s).backgroundColor === color.track).length, 2);
  });
});

describe('StatusList', () => {
  test('attention row pairs the dot with attention text — never color alone', async () => {
    const r = await render(
      <StatusList items={[{ key: 'money', label: 'Money', value: '1 thing due today', needsAttention: true }]} />,
    );
    const dot = r.root.findAllByType('View').find((v) => flatten(v).width === 6);
    assert.ok(dot, 'attention dot rendered');
    assert.equal(flatten(dot).backgroundColor, color.status.attention);
    const value = r.root.findAllByType('Text').find((t) => t.props.children === '1 thing due today');
    assert.equal(flatten(value).color, color.status.attention);
  });

  test('pressable row derives its accessibility label from label and value', async () => {
    const r = await render(
      <StatusList items={[{ key: 'kids', label: 'Kids', value: '1 scheduled', onPress: () => {} }]} />,
    );
    const p = r.root.findByType('Pressable');
    assert.equal(p.props.accessibilityRole, 'button');
    assert.equal(p.props.accessibilityLabel, 'Kids: 1 scheduled');
  });

  /**
   * A row that leads nowhere is still a statement. Left unlabelled, a screen
   * reader walks the two Texts separately and the value arrives detached from
   * the thing it describes — "3 on your list, nothing due" with no way to know
   * it was Home. Most rows on the Life hub and the Today summary are of this
   * kind, so the label cannot depend on the row happening to be pressable.
   */
  test('a row that is not pressable is still announced as one statement', async () => {
    const r = await render(
      <StatusList items={[{ key: 'home', label: 'Home', value: '3 on your list, nothing due' }]} />,
    );
    assert.equal(r.root.findAllByType('Pressable').length, 0);

    const spoken = r.root.findAllByType('View').find((v) => v.props.accessible === true);
    assert.ok(spoken, 'a non-pressable row exposes an accessible element');
    assert.equal(spoken.props.accessibilityLabel, 'Home: 3 on your list, nothing due');
  });

  test('an explicit accessibilityLabel wins over the derived one, pressable or not', async () => {
    const still = await render(
      <StatusList items={[{ key: 'kid', label: 'Ada, 7', value: 'Nothing today', accessibilityLabel: 'Ada, 7, born Mar 4, 2019: Nothing today' }]} />,
    );
    const spokenStill = still.root.findAllByType('View').find((v) => v.props.accessible === true);
    assert.equal(spokenStill.props.accessibilityLabel, 'Ada, 7, born Mar 4, 2019: Nothing today');

    const pressable = await render(
      <StatusList items={[{ key: 'kid', label: 'Ada, 7', value: 'Nothing today', accessibilityLabel: 'Ada, 7, born Mar 4, 2019: Nothing today', onPress: () => {} }]} />,
    );
    assert.equal(pressable.root.findByType('Pressable').props.accessibilityLabel, 'Ada, 7, born Mar 4, 2019: Nothing today');
  });
});

describe('System states', () => {
  test('LoadingState announces itself as a progress bar', async () => {
    const r = await render(<LoadingState label="Syncing your household…" />);
    const wrap = r.root.findAllByType('View')[0];
    assert.equal(wrap.props.accessibilityRole, 'progressbar');
    assert.equal(wrap.props.accessibilityLabel, 'Syncing your household…');
  });

  test('EmptyState explains and offers at most one action', async () => {
    let pressed = 0;
    const r = await render(
      <EmptyState title="Nothing captured yet" body="Say it in a sentence and Her Keys will hold it." actionLabel="Capture one now" onAction={() => pressed++} />,
    );
    const title = r.root.findAllByType('Text').find((t) => t.props.children === 'Nothing captured yet');
    assert.ok(title, 'title rendered');
    const action = r.root.findAllByType('Text').find((t) => t.props.accessibilityRole === 'link');
    assert.ok(action, 'action is an explicit link role');
  });

  test('ErrorState is an alert with a retry path', async () => {
    let retried = 0;
    const r = await render(<ErrorState body="That change didn’t save." onRetry={() => retried++} />);
    const wrap = r.root.findAllByType('View')[0];
    assert.equal(wrap.props.accessibilityRole, 'alert');
    assert.ok(r.root.findAllByType('Text').some((t) => t.props.children === 'Try again'));
  });

  test('OfflineState says what still works', async () => {
    const r = await render(<OfflineState />);
    assert.ok(r.root.findAllByType('Text').some((t) => String(t.props.children).includes('offline')));
  });

  test('InlineNotice accepts only the fixed tone union and derives treatment from it', async () => {
    const tones = {
      info: { bg: color.ai.insightSoft, fg: color.ai.insight },
      attention: { bg: color.status.attentionSoft, fg: color.status.attention },
      success: { bg: color.status.successSoft, fg: color.status.success },
      waiting: { bg: color.status.waitingSoft, fg: color.status.waiting },
    };
    for (const [tone, want] of Object.entries(tones)) {
      const r = await render(<InlineNotice tone={tone} title={`${tone} title`} body="details" />);
      assert.equal(flatten(r.root.findByType('View')).backgroundColor, want.bg, `${tone} bg`);
      assert.equal(flatten(r.root.findAllByType('Text')[0]).color, want.fg, `${tone} fg`);
    }
  });
});

describe('Sheet + ConfirmationSheet', () => {
  test('Sheet projects a modal with a scrim dismiss control', async () => {
    let closed = 0;
    const r = await render(
      <Sheet visible onClose={() => closed++} accessibilityLabel="Why this move">
        <Tag label="inside" />
      </Sheet>,
    );
    const modal = r.root.findByType('Modal');
    assert.equal(modal.props.accessibilityViewIsModal, true);
    assert.equal(modal.props.accessibilityLabel, 'Why this move');
    const scrim = r.root.findByType('Pressable');
    assert.equal(scrim.props.accessibilityLabel, 'Dismiss');
  });

  test('ConfirmationSheet labels both paths explicitly', async () => {
    let cancel = 0;
    let confirm = 0;
    const r = await render(
      <ConfirmationSheet
        visible
        title="Move it to tomorrow?"
        body="The library books stay one more day; nothing else changes."
        cancelLabel="Keep today as planned"
        confirmLabel="Move it"
        onCancel={() => cancel++}
        onConfirm={() => confirm++}
      />,
    );
    const labels = r.root.findAllByType('Text').map((t) => t.props.children);
    assert.ok(labels.includes('Move it to tomorrow?'));
    assert.ok(labels.includes('Keep today as planned'));
    assert.ok(labels.includes('Move it'));
  });
});

describe('Overline', () => {
  test('uppercases and uses the label rung color', async () => {
    const r = await render(<Overline>Where things stand</Overline>);
    const t = r.root.findByType('Text');
    assert.equal(t.props.children, 'WHERE THINGS STAND');
    assert.equal(flatten(t).color, color.text.muted);
  });
});

describe('Divider', () => {
  test('renders a hairline rule', async () => {
    const r = await render(<Divider />);
    assert.ok(r.root.findAllByType('View').length >= 1);
  });
});
