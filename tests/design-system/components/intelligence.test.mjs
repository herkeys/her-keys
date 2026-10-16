/**
 * Contract tests for the intelligence presentation system
 * (HK-FE-UI-01 §13–§15, K3).
 *
 * The audited property: every visible semantic treatment derives from the
 * allowed typed domain input — the provenance vocabulary, the frozen
 * confidence model, the derived intent lifecycle — and NOT from arbitrary
 * UI-only state. fact vs inference, recommendation vs executed action, and
 * suggestion vs approval-required must be visually distinguishable; no
 * component invents a semantic the domain doesn't store.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { describe, test } from 'node:test';
import { StyleSheet } from 'react-native';
import {
  ActionStateBlock,
  ClarificationPrompt,
  ConfidenceBadge,
  InsightBlock,
  InterpretationReview,
  ProvenanceLabel,
  PROVENANCE_LABEL,
  RecommendationBlock,
  WhyThis,
} from '../../../src/design/components/index.ts';
import { PROVENANCE_SOURCES } from '../../../src/domain/foundation/provenance.ts';
import { CONFIDENCE_LEVELS } from '../../../src/domain/schemaPrimitives.ts';
import { color } from '../../../src/design/tokens.ts';
import { render } from '../../support/render.tsx';

const flatten = (node) => StyleSheet.flatten(node.props.style) ?? {};
const allText = (root) =>
  root
    .findAllByType('Text')
    .map((t) => (Array.isArray(t.props.children) ? t.props.children.join('') : t.props.children))
    .join(' ');

describe('InsightBlock (HER KEYS INSIGHT)', () => {
  test('names the register in text and marks it as an unconfirmed reading by SHAPE (dashed), not by plum', async () => {
    const r = await render(<InsightBlock>You haven’t had a quiet evening in nine days.</InsightBlock>);
    assert.match(allText(r.root), /HER KEYS NOTICED/i);
    const card = flatten(r.root.findByType('View'));
    assert.equal(card.borderStyle, 'dashed', 'an AI reading is outlined, not filled-and-settled');
    assert.equal(card.borderColor, color.ai.insightBorder);
    assert.ok(r.root.findAll((n) => n.props.testID === 'ai-mark-noticed').length > 0, 'carries the noticed mark');
    assert.equal(r.root.findAll((n) => n.props.testID === 'ai-mark-confirmed').length, 0, 'never implies confirmation');
  });

  test('dismiss is an explicit affordance, present only when asked for', async () => {
    const withDismiss = await render(<InsightBlock onDismiss={() => {}}>x</InsightBlock>);
    const pressables = withDismiss.root.findAllByType('Pressable');
    assert.ok(pressables.some((p) => p.props.accessibilityLabel === 'Dismiss this notice'));
    const without = await render(<InsightBlock>x</InsightBlock>);
    assert.ok(!without.root.findAllByType('Pressable').some((p) => p.props.accessibilityLabel === 'Dismiss this notice'));
  });
});

describe('RecommendationBlock (HER KEYS RECOMMENDATION)', () => {
  test('approval-required and suggested are structurally different', async () => {
    const suggested = await render(<RecommendationBlock body="Move the library run to Saturday." approvalRequired={false} onApprove={() => {}} />);
    const needsYes = await render(<RecommendationBlock body="Move the library run to Saturday." approvalRequired onApprove={() => {}} />);

    assert.doesNotMatch(allText(suggested.root), /NEEDS YOUR YES/);
    assert.match(allText(needsYes.root), /NEEDS YOUR YES/);
    // A recommendation awaiting her answer is NOT rendered as settled/success.
    assert.doesNotMatch(allText(needsYes.root), /Done/i);
  });

  test('the primary action label reflects whether approval is required', async () => {
    const suggested = await render(<RecommendationBlock body="x" approvalRequired={false} onApprove={() => {}} />);
    assert.match(allText(suggested.root), /Do that/);
    const needsYes = await render(<RecommendationBlock body="x" approvalRequired onApprove={() => {}} />);
    assert.match(allText(needsYes.root), /Yes, do that/);
  });
});

describe('WhyThis (structured evidence, no chain-of-thought)', () => {
  test('renders caller-provided evidence lines and nothing of its own', async () => {
    const r = await render(
      <WhyThis reasons={['Tomorrow has a 65-minute window after pickup.', 'Today’s only gap is 35 minutes.']} />,
    );
    const text = allText(r.root);
    assert.match(text, /Why this/i);
    assert.match(text, /65-minute window/);
    assert.ok(r.root.findAllByType('Text').length <= 3, 'no invented commentary');
  });

  test('absent evidence renders nothing', async () => {
    const r = await render(<WhyThis reasons={[]} />);
    assert.equal(r.root.findAllByType('View').length, 0);
  });
});

describe('ClarificationPrompt', () => {
  test('states Her Keys’ reading as a claim with confirm + correct exits', async () => {
    let confirmed = 0;
    let corrected = 0;
    const r = await render(
      <ClarificationPrompt
        question="Which day did you mean?"
        proposed="The field trip payment is due Friday."
        onConfirm={() => confirmed++}
        onCorrect={() => corrected++}
      />,
    );
    const text = allText(r.root);
    assert.match(text, /Which day did you mean\?/);
    assert.match(text, /I think this means/);
    const labels = r.root.findAllByType('Pressable').map((p) => p.props.accessibilityHint ?? p.props.accessibilityLabel);
    assert.ok(labels.includes("Confirms Her Keys' reading"));
    assert.ok(labels.includes("Corrects Her Keys' reading"));
    r.root.findAllByType('Pressable').find((p) => p.props.accessibilityHint === "Confirms Her Keys' reading").props.onPress();
    r.root.findAllByType('Pressable').find((p) => p.props.accessibilityHint === "Corrects Her Keys' reading").props.onPress();
    assert.equal(confirmed, 1);
    assert.equal(corrected, 1);
  });
});

describe('InterpretationReview', () => {
  test('renders exactly the typed fields passed in, with accept/reject/correct exits', async () => {
    const r = await render(
      <InterpretationReview
        fields={[
          { label: 'Kind', value: 'Task' },
          { label: 'Title', value: 'Call insurance about the claim' },
        ]}
        onAccept={() => {}}
        onReject={() => {}}
        onCorrect={() => {}}
      />,
    );
    const text = allText(r.root);
    assert.match(text, /WHAT I UNDERSTOOD/i);
    assert.match(text, /Call insurance about the claim/);
    const labels = r.root.findAllByType('Pressable').map((p) => p.props.accessibilityHint ?? p.props.accessibilityLabel);
    assert.ok(labels.includes('Accepts this understanding'));
    assert.ok(labels.includes('Rejects this understanding'));
  });
});

describe('ConfidenceBadge', () => {
  test('the only levels are the frozen vocabulary possible/likely/established', async () => {
    assert.deepEqual([...CONFIDENCE_LEVELS].sort(), ['established', 'likely', 'possible']);
  });

  test('uncertain claims read as inference; established reads as confirmation', async () => {
    for (const level of ['possible', 'likely']) {
      const r = await render(<ConfidenceBadge level={level} />);
      assert.equal(flatten(r.root.findByType('View')).backgroundColor, color.ai.inferenceSoft);
    }
    const established = await render(<ConfidenceBadge level="established" />);
    assert.equal(flatten(established.root.findByType('View')).backgroundColor, color.ai.confirmationSoft);
  });

  test('no percentages, no invented tiers in the label', async () => {
    const r = await render(<ConfidenceBadge level="likely" />);
    assert.match(allText(r.root), /^LIKELY$/);
    assert.doesNotMatch(allText(r.root), /%/);
  });
});

describe('ProvenanceLabel', () => {
  test('covers exactly the stored producer vocabulary — no more, no fewer', async () => {
    assert.deepEqual(Object.keys(PROVENANCE_LABEL).sort(), [...PROVENANCE_SOURCES].sort());
  });

  test('legacy-unknown is rendered honestly, never as user-stated', async () => {
    const r = await render(<ProvenanceLabel source="legacy-unknown" />);
    assert.match(allText(r.root), /Source unknown/);
    assert.doesNotMatch(allText(r.root), /You said|You told/i);
  });

  test('user-stated and ai-inference producers read differently', async () => {
    const stated = await render(<ProvenanceLabel source="user-action" />);
    const inferred = await render(<ProvenanceLabel source="ai-inference" />);
    assert.match(allText(stated.root), /You said/);
    assert.match(allText(inferred.root), /Her Keys inferred/);
    assert.notEqual(allText(stated.root), allText(inferred.root));
  });
});

describe('ActionStateBlock', () => {
  test('proposed is approval-required and offers yes/no; approved is only prepared', async () => {
    const proposed = await render(
      <ActionStateBlock stage="proposed" summary="Move the dentist call to Thursday." approvalQuestion="May Her Keys move it?" onApprove={() => {}} onDecline={() => {}} />,
    );
    assert.match(allText(proposed.root), /NEEDS YOUR YES/);
    const labels = proposed.root.findAllByType('Pressable').map((p) => p.props.accessibilityHint ?? p.props.accessibilityLabel);
    assert.ok(labels.includes('Approves this action'));
    assert.ok(labels.includes('Declines this action'));

    const approved = await render(<ActionStateBlock stage="approved" summary="Move the dentist call to Thursday." />);
    assert.match(allText(approved.root), /Ready — will run/i);
    assert.doesNotMatch(allText(approved.root), /Done/i);
    assert.equal(approved.root.findAllByType('Pressable').length, 0, 'a prepared action demands no buttons');
  });

  test('succeeded with outcome renders as settled, never as failed', async () => {
    const done = await render(<ActionStateBlock stage="succeeded" outcome="verified" summary="The reminder was rescheduled." />);
    assert.match(allText(done.root), /Done/i);
    const card = done.root.findByType('View');
    assert.equal(flatten(card).backgroundColor, color.status.successSoft);
  });

  test('failed renders as needing attention, structurally distinct from success', async () => {
    const failed = await render(<ActionStateBlock stage="failed" summary="The school portal refused the change." />);
    assert.match(allText(failed.root), /Didn’t work/i);
    const card = failed.root.findByType('View');
    assert.equal(flatten(card).backgroundColor, color.status.riskSoft);
  });

  test('declined and withdrawn are honest quiet states', async () => {
    const declined = await render(<ActionStateBlock stage="declined" summary="x" />);
    assert.match(allText(declined.root), /You said no/i);
    const withdrawn = await render(<ActionStateBlock stage="withdrawn" summary="x" />);
    assert.match(allText(withdrawn.root), /Withdrawn/i);
  });
});

// ---------------------------------------------------------------------------
// HK-FE-UI-02 §6 — the AI language no longer relies on plum. Label + structure + shape.
// ---------------------------------------------------------------------------
describe('HK-FE-UI-02 AI truth semantics survive the palette change', () => {
  const marks = (r) => [...new Set(r.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('ai-mark-')).map((n) => n.props.testID))];

  test('every register carries an explicit text label AND a mark of the right meaning', async () => {
    const noticed = await render(<InsightBlock>x</InsightBlock>);
    const rec = await render(<RecommendationBlock body="x" approvalRequired={false} onApprove={() => {}} />);
    const understood = await render(<InterpretationReview fields={[{ label: 'When', value: 'Sat' }]} onAccept={() => {}} onReject={() => {}} />);
    const asks = await render(<ClarificationPrompt question="q" proposed="p" onConfirm={() => {}} onCorrect={() => {}} />);
    assert.deepEqual(marks(noticed), ['ai-mark-noticed']);
    assert.deepEqual(marks(rec), ['ai-mark-suggests']);
    assert.deepEqual(marks(understood), ['ai-mark-understood']);
    assert.deepEqual(marks(asks), ['ai-mark-asks']);
    assert.match(allText(noticed.root), /HER KEYS NOTICED/i);
    assert.match(allText(rec.root), /WHAT I RECOMMEND/i);
    assert.match(allText(understood.root), /WHAT I UNDERSTOOD/i);
    assert.match(allText(asks.root), /HER KEYS NEEDS ONE THING/i);
  });

  test('a recommendation is structurally NOT a fact or an unconfirmed reading: solid rail, never dashed, never a confirmed mark', async () => {
    const rec = await render(<RecommendationBlock body="x" approvalRequired={false} onApprove={() => {}} />);
    const card = flatten(rec.root.findByType('View'));
    assert.notEqual(card.borderStyle, 'dashed');
    assert.equal(card.borderLeftColor, color.action.primary);
    assert.ok(!marks(rec).includes('ai-mark-confirmed'));
  });

  test('unconfirmed readings (insight, understood, clarification) all share the dashed outline', async () => {
    for (const el of [
      <InsightBlock>x</InsightBlock>,
      <InterpretationReview fields={[]} onAccept={() => {}} onReject={() => {}} />,
      <ClarificationPrompt question="q" proposed="p" onConfirm={() => {}} onCorrect={() => {}} />,
    ]) {
      const r = await render(el);
      assert.equal(flatten(r.root.findByType('View')).borderStyle, 'dashed');
    }
  });

  test('an action proposal never looks like completed work; only a succeeded execution gets the confirmed mark', async () => {
    const proposed = await render(<ActionStateBlock stage="proposed" summary="x" approvalQuestion="ok?" onApprove={() => {}} onDecline={() => {}} />);
    const approved = await render(<ActionStateBlock stage="approved" summary="x" />);
    const failed = await render(<ActionStateBlock stage="failed" summary="x" />);
    const done = await render(<ActionStateBlock stage="succeeded" outcome="verified" summary="x" />);
    assert.deepEqual(marks(proposed), ['ai-mark-needsApproval']);
    assert.deepEqual(marks(approved), []);
    assert.deepEqual(marks(failed), []);
    assert.deepEqual(marks(done), ['ai-mark-confirmed']);
    assert.match(allText(proposed.root), /NEEDS YOUR YES/i);
    assert.match(allText(approved.root), /READY — WILL RUN/i);
  });

  test('uncertain confidence reads as a question mark, established as a check — beside the text label', async () => {
    const possible = await render(<ConfidenceBadge level="possible" />);
    const established = await render(<ConfidenceBadge level="established" />);
    assert.equal(possible.root.findByType('Ionicons').props.name, 'help-circle-outline');
    assert.equal(established.root.findByType('Ionicons').props.name, 'checkmark-circle');
    assert.match(allText(possible.root), /POSSIBLE/);
    assert.match(allText(established.root), /ESTABLISHED/);
  });

  test('mark vocabulary is closed and every mark has exactly one epistemic meaning', async () => {
    const { AI_MARKS } = await import('../../../src/design/components/intelligence.tsx');
    assert.deepEqual(Object.keys(AI_MARKS).sort(), ['asks', 'confirmed', 'needsApproval', 'noticed', 'suggests', 'understood']);
    const confirmed = Object.entries(AI_MARKS).filter(([, m]) => m.meaning === 'confirmed').map(([k]) => k);
    assert.deepEqual(confirmed, ['confirmed']);
  });
});
