import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { color, radius, spacing } from '../tokens';
import type { ConfidenceLevel, ProvenanceSource } from '../../domain/foundation/provenance';
import type { IntentStage } from '../../domain/authorization';
import type { OutcomeKind } from '../../domain/foundation/authorization';
import { AppText, Overline } from './AppText';
import { Button } from './Button';
import { Card } from './Card';

/**
 * THE HER KEYS INTELLIGENCE PRESENTATION SYSTEM — HK-FE-UI-01 §13–§15.
 *
 * The front end is NOT a second semantics authority. Every component here
 * renders a frozen Build 4 durable/domain concept and nothing else:
 *
 *   - provenance comes from the PROVENANCE_SOURCES vocabulary, read off the row
 *   - confidence comes from the confidence model (possible / likely /
 *     established) and exists ONLY on confidence-bearing rows — a user-stated
 *     fact never acquires a fake confidence because a UI would like one
 *   - action state comes from the derived IntentStage / execution / outcome
 *     records, or from the ActionRecord decision ledger
 *
 * Rule (§13): NO DURABLE/DOMAIN SEMANTIC COUNTERPART = DO NOT INVENT ONE IN
 * THE UI. These components take typed domain values as props; they never
 * derive semantics from arbitrary UI state, never invent confidence tiers,
 * never show chain-of-thought. Color never carries the meaning alone — every
 * pattern pairs its treatment with an explicit text label.
 *
 * Plum is used selectively (owner decision 2): it marks the "Her Keys
 * noticed" intelligence register and nothing else. It is not recurring AI
 * chrome; insight blocks read as the same product as everything around them.
 */

// ---------------------------------------------------------------------------
// HER KEYS INSIGHT — “Her Keys noticed…”
// ---------------------------------------------------------------------------

interface InsightBlockProps {
  children: ReactNode;
  /** Dismiss is a UI-only gesture; the durable reading it renders is untouched. */
  onDismiss?: () => void;
  style?: ViewStyle;
}

/**
 * A reading Her Keys surfaced (an inference or an observed pattern worth her
 * attention). Rendered as quiet plum — the one selective AI semantic
 * treatment — with an explicit "HER KEYS NOTICED" eyebrow so the register is
 * named in text, not carried by color alone.
 */
export function InsightBlock({ children, onDismiss, style }: InsightBlockProps) {
  return (
    <Card tone="subtle" style={[styles.insightCard, style]}>
      <View style={styles.insightHeader}>
        <Overline color={color.ai.insight}>Her Keys noticed</Overline>
        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss this notice"
            hitSlop={spacing.sm}
          >
            <AppText variant="metadata" color={color.text.muted}>
              Dismiss
            </AppText>
          </Pressable>
        ) : null}
      </View>
      <AppText variant="body" style={styles.insightBody}>
        {children}
      </AppText>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// HER KEYS RECOMMENDATION — “What I recommend…”
// ---------------------------------------------------------------------------

interface RecommendationBlockProps {
  /** What Her Keys recommends, in her language. The caller reads it from the domain. */
  body: string;
  /**
   * true when acting on this needs her explicit approval (a recommendation or
   * inference that requires approval per semantics.ts). SUGGESTED and
   * APPROVAL-REQUIRED must never look interchangeable (§15).
   */
  approvalRequired: boolean;
  /**
   * Overrides the primary action label when the gesture means more than
   * "do that" — e.g. One Move's "I did it", where she performs the
   * recommendation herself and the decision recorded is hers.
   */
  actionLabel?: string;
  /** Right-aligned metadata (e.g. "ABOUT 15 MINUTES"), when the domain provides it. */
  meta?: string;
  onApprove?: () => void;
  onShowAlternative?: () => void;
  onNotToday?: () => void;
  style?: ViewStyle;
}

/**
 * One Move and future recommendation surfaces. A plain suggestion is a quiet
 * clay action block; an approval-required recommendation additionally carries
 * an explicit "Needs your yes" marker — the distinction is structural text +
 * tone, never color alone.
 */
export function RecommendationBlock({
  body,
  approvalRequired,
  actionLabel,
  meta,
  onApprove,
  onShowAlternative,
  onNotToday,
  style,
}: RecommendationBlockProps) {
  const primaryLabel = actionLabel ?? (approvalRequired ? 'Yes, do that' : 'Do that');
  return (
    <Card tone="surface" style={style}>
      <View style={styles.recHeader}>
        <Overline color={color.action.primary}>What I recommend</Overline>
        {approvalRequired ? (
          <View style={styles.approvalMarker}>
            <AppText variant="statusLabel" color={color.status.attention}>
              NEEDS YOUR YES
            </AppText>
          </View>
        ) : meta ? (
          <AppText variant="statusLabel" color={color.text.muted}>
            {meta}
          </AppText>
        ) : null}
      </View>
      <AppText variant="bodyStrong" style={styles.recBody}>
        {body}
      </AppText>
      <View style={styles.recActions}>
        <Button
          label={primaryLabel}
          onPress={onApprove ?? (() => {})}
          disabled={!onApprove}
          accessibilityHint={approvalRequired ? 'Approves this one recommendation' : undefined}
        />
        <View style={styles.recRow}>
          {onShowAlternative ? <Button label="Show another option" variant="secondary" onPress={onShowAlternative} /> : null}
          {onNotToday ? <Button label="Not today" variant="ghost" onPress={onNotToday} /> : null}
        </View>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// WHY THIS? — structured reasoning evidence (NO chain-of-thought)
// ---------------------------------------------------------------------------

interface WhyThisProps {
  /**
   * Short evidence statements the caller gathered through the reasoning layer
   * (transition windows, capacity, timings). Each is a durable fact about the
   * schedule, never a model transcript. The component adds none of its own.
   */
  reasons: readonly string[];
  style?: ViewStyle;
}

/** “Why?” — the evidence behind a recommendation, stated as facts. */
export function WhyThis({ reasons, style }: WhyThisProps) {
  if (reasons.length === 0) return null;
  return (
    <View style={style} accessibilityLabel="Why this">
      <Overline>Why this</Overline>
      {reasons.map((reason, index) => (
        <View key={index} style={styles.whyRow}>
          <View style={styles.whyDot} />
          <AppText variant="supporting" color={color.text.secondary} style={styles.whyText}>
            {reason}
          </AppText>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// CLARIFICATION — “I think this means X. Is that right?”
// ---------------------------------------------------------------------------

interface ClarificationPromptProps {
  /** The open question Her Keys is asking (from the interpretation's clarification). */
  question: string;
  /** Her Keys' proposed reading, stated as a claim she can confirm or correct. */
  proposed: string;
  onConfirm: () => void;
  onCorrect: () => void;
  style?: ViewStyle;
}

/**
 * Asked while an interpretation is `clarifying`. The proposed reading is
 * always presented as Her Keys' claim — a thing she can confirm or fix —
 * never as settled fact.
 */
export function ClarificationPrompt({ question, proposed, onConfirm, onCorrect, style }: ClarificationPromptProps) {
  return (
    <Card tone="surface" style={style}>
      <Overline color={color.ai.insight}>Her Keys needs one thing</Overline>
      <AppText variant="body" style={styles.clarifyQuestion}>
        {question}
      </AppText>
      <Card tone="subtle" style={styles.clarifyProposed}>
        <AppText variant="supporting" color={color.text.secondary}>
          I think this means:{' '}
        </AppText>
        <AppText variant="bodyStrong">{proposed}</AppText>
      </Card>
      <View style={styles.recRow}>
        <Button label="That's right" onPress={onConfirm} accessibilityHint="Confirms Her Keys' reading" />
        <Button label="Fix it" variant="secondary" onPress={onCorrect} accessibilityHint="Corrects Her Keys' reading" />
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// INTERPRETATION REVIEW — “What I understood…”
// ---------------------------------------------------------------------------

export interface InterpretationField {
  label: string;
  value: string;
}

interface InterpretationReviewProps {
  /**
   * The typed fields of a structured candidate (kind, title, when, amount),
   * passed by the caller straight from the durable interpretation — the
   * component invents no fields.
   */
  fields: readonly InterpretationField[];
  onAccept: () => void;
  onReject: () => void;
  onCorrect?: () => void;
  style?: ViewStyle;
}

/**
 * What Her Keys understood from something she said or that arrived. Shown
 * while the candidate waits OUTSIDE canonical state; accepting creates the
   * real row, rejecting never deletes the source.
 */
export function InterpretationReview({ fields, onAccept, onReject, onCorrect, style }: InterpretationReviewProps) {
  return (
    <Card tone="surface" style={style}>
      <Overline color={color.ai.insight}>What I understood</Overline>
      {fields.map((field) => (
        <View key={field.label} style={styles.reviewRow}>
          <AppText variant="metadata" color={color.text.muted} style={styles.reviewLabel}>
            {field.label}
          </AppText>
          <AppText variant="body">{field.value}</AppText>
        </View>
      ))}
      <View style={styles.recRow}>
        <Button label="Save it like that" onPress={onAccept} accessibilityHint="Accepts this understanding" />
        <Button label="That's not it" variant="secondary" onPress={onReject} accessibilityHint="Rejects this understanding" />
        {onCorrect ? <Button label="Fix it" variant="ghost" onPress={onCorrect} /> : null}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// CONFIDENCE / UNCERTAINTY — only from the approved confidence model
// ---------------------------------------------------------------------------

interface ConfidenceBadgeProps {
  /**
   * possible / likely / established — the full frozen vocabulary. There is no
   * fourth tier and no percentage; the type forbids both.
   */
  level: ConfidenceLevel;
}

const CONFIDENCE_TONE: Record<ConfidenceLevel, { fg: string; bg: string }> = {
  // A claim Her Keys made and she has not confirmed: uncertainty is visible.
  possible: { fg: color.ai.inference, bg: color.ai.inferenceSoft },
  likely: { fg: color.ai.inference, bg: color.ai.inferenceSoft },
  // She confirmed it (or accepted the candidate): settled, shown as confirmation.
  established: { fg: color.ai.confirmation, bg: color.ai.confirmationSoft },
};

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  possible: 'POSSIBLE',
  likely: 'LIKELY',
  established: 'ESTABLISHED',
};

/**
 * Renders the stored confidence of a claim. Only ever pass a confidence that
 * exists on the row: `carriesConfidence(provenance.producer)`. A user-stated
 * fact renders NO badge — certainty she stated is not a "confidence level".
 */
export function ConfidenceBadge({ level }: ConfidenceBadgeProps) {
  const tone = CONFIDENCE_TONE[level];
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <AppText variant="statusLabel" color={tone.fg}>
        {CONFIDENCE_LABEL[level]}
      </AppText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SOURCE / PROVENANCE — rendered from the approved producer vocabulary
// ---------------------------------------------------------------------------

interface ProvenanceLabelProps {
  source: ProvenanceSource;
}

/**
 * Where a row came from, in her language. `legacy-unknown` is rendered
 * HONESTLY — "Source unknown" — never dressed up as something she said.
 */
export function ProvenanceLabel({ source }: ProvenanceLabelProps) {
  return (
    <AppText variant="metadata" color={color.text.muted}>
      {PROVENANCE_LABEL[source]}
    </AppText>
  );
}

export const PROVENANCE_LABEL: Record<ProvenanceSource, string> = {
  onboarding: 'You told Her Keys during setup',
  'user-action': 'You said',
  'talk-it-out': 'From Talk It Out',
  'system-derived': 'From your household setup',
  'import-sync': 'From an external source',
  'ai-inference': 'Her Keys inferred this',
  'demo-seed': 'Demo data',
  automation: 'Her Keys automation',
  'legacy-unknown': 'Source unknown',
};

// ---------------------------------------------------------------------------
// ACTION STATE — derived from intent lifecycle, executions and outcomes
// ---------------------------------------------------------------------------

interface ActionStateBlockProps {
  /** Derived by `intentLifecycle()` — the single authority on where an intent stands. */
  stage: IntentStage;
  /** The latest observed outcome, when an execution has one. */
  outcome?: OutcomeKind | null;
  /** One short sentence naming the action (caller-provided, from the domain). */
  summary: string;
  /** What Her Keys is asking permission to do — shown only while it needs her. */
  approvalQuestion?: string;
  onApprove?: () => void;
  onDecline?: () => void;
  style?: ViewStyle;
}

type ActionPresentation = {
  eyebrow: string;
  eyebrowColor: string;
  surface: 'surface' | 'subtle' | 'attention' | 'success' | 'risk';
  needsButtons: boolean;
};

function actionPresentation(stage: IntentStage, outcome: OutcomeKind | null | undefined): ActionPresentation {
  switch (stage) {
    // Her Keys is asking. APPROVAL REQUIRED is structurally different from a
    // suggestion: it names the permission and demands her answer.
    case 'proposed':
      return { eyebrow: 'Needs your yes', eyebrowColor: color.status.attention, surface: 'attention', needsButtons: true };
    case 'approved':
      // Approved but not yet attempted: prepared, waiting — never shown as done.
      return { eyebrow: 'Ready — will run', eyebrowColor: color.status.waiting, surface: 'subtle', needsButtons: false };
    case 'attempted':
      return { eyebrow: 'Running now', eyebrowColor: color.status.waiting, surface: 'subtle', needsButtons: false };
    case 'succeeded':
      return outcome
        ? { eyebrow: `Done — ${OUTCOME_LABEL[outcome].toLowerCase()}`, eyebrowColor: color.status.success, surface: 'success', needsButtons: false }
        : { eyebrow: 'Done', eyebrowColor: color.status.success, surface: 'success', needsButtons: false };
    case 'failed':
      return { eyebrow: 'Didn’t work — needs you', eyebrowColor: color.status.risk, surface: 'risk', needsButtons: false };
    case 'declined':
      return { eyebrow: 'You said no', eyebrowColor: color.text.muted, surface: 'subtle', needsButtons: false };
    case 'withdrawn':
      return { eyebrow: 'Withdrawn', eyebrowColor: color.text.muted, surface: 'subtle', needsButtons: false };
  }
}

export const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  verified: 'Verified',
  verification_failed: 'Couldn’t be verified',
  delivered: 'Delivered',
  acknowledged: 'Acknowledged',
  accepted: 'Accepted',
  declined: 'Declined',
  completed: 'Completed',
  paid: 'Paid',
  cancelled: 'Cancelled',
  followed: 'Followed up',
  expired: 'Expired',
  no_effect: 'No effect',
};

/**
 * Where a Her Keys action stands: asked → prepared → executed → outcome, or
 * failed / declined / withdrawn. The stage ALWAYS comes from the derived
 * lifecycle — the component computes nothing from UI state, and a prepared
 * action can never render as a successful outcome.
 */
export function ActionStateBlock({
  stage,
  outcome,
  summary,
  approvalQuestion,
  onApprove,
  onDecline,
  style,
}: ActionStateBlockProps) {
  const presentation = actionPresentation(stage, outcome);
  return (
    <Card tone={presentation.surface} style={style}>
      <Overline color={presentation.eyebrowColor}>{presentation.eyebrow}</Overline>
      <AppText variant="body" style={styles.actionSummary}>
        {summary}
      </AppText>
      {stage === 'proposed' && approvalQuestion ? (
        <AppText variant="supporting" color={color.text.secondary} style={styles.actionSummary}>
          {approvalQuestion}
        </AppText>
      ) : null}
      {presentation.needsButtons ? (
        <View style={styles.recRow}>
          <Button label="Yes, go ahead" onPress={onApprove ?? (() => {})} disabled={!onApprove} accessibilityHint="Approves this action" />
          <Button label="No" variant="secondary" onPress={onDecline ?? (() => {})} disabled={!onDecline} accessibilityHint="Declines this action" />
        </View>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  insightCard: {
    borderLeftWidth: 3,
    borderLeftColor: color.ai.insightBorder,
  },
  insightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  insightBody: { marginTop: spacing.sm },
  recHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  approvalMarker: {
    backgroundColor: color.status.attentionSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
  },
  recBody: { marginTop: spacing.sm },
  recActions: { marginTop: spacing.lg, gap: spacing.sm },
  recRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  whyRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.sm },
  whyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.border.control,
    marginTop: 7,
    marginRight: spacing.md,
  },
  whyText: { flex: 1 },
  clarifyQuestion: { marginTop: spacing.sm },
  clarifyProposed: { marginTop: spacing.md, padding: spacing.lg },
  reviewRow: { marginTop: spacing.md },
  reviewLabel: { marginBottom: spacing.xxs },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs + 1,
    borderRadius: radius.pill,
  },
  actionSummary: { marginTop: spacing.sm },
});
