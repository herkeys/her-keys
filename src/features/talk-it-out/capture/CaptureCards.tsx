import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  ChipToggle,
  ConfidenceBadge,
  InlineNotice,
  Overline,
  ProvenanceLabel,
  Sheet,
  TextField,
  WhyThis,
} from '../../../design/components';
import { color, spacing } from '../../../design/tokens';
import { logicalDateAt } from '../../../domain/logicalDay';
import { useStoreSnapshot } from '../../../store/AppStateProvider';
import { useCapture, useCaptureVM } from './CaptureContext';
import { copy } from './copy';
import { dayChoices, initialForm, patchFromForm, type FixForm } from './fixForm';
import type { ProposalVM, QuestionVM } from './viewModel';
import type { ClarificationAnswer, ProposalKind } from './types';

/**
 * Feature-local compositions of the permanent design system — no new card, button, sheet, confidence or
 * provenance vocabulary is introduced. Where the system lacks a primitive (choice among candidates, source
 * echo, review with uncertainty notes), the gap is recorded in the ledger's MISSING GLOBAL PRIMITIVE register
 * and composed here from existing parts.
 *
 * Nothing in this file creates a household record. Every action calls the coordinator.
 */

// ------------------------------------------------------------------ pieces ---

function SourceEcho({ source }: { source: NonNullable<ReturnType<typeof useCaptureVM>>['source'] }) {
  const [expanded, setExpanded] = useState(false);
  if (source.kind === 'unavailable') {
    return (
      <Card tone="subtle" style={styles.block}>
        <AppText variant="supporting" color={color.text.secondary}>
          {source.message}
        </AppText>
      </Card>
    );
  }
  return (
    <Card tone="subtle" style={styles.block}>
      <Overline>{source.label}</Overline>
      {/* Her words, exactly. A long source is collapsed by the screen, never shortened in what is kept. */}
      <AppText variant="body" style={styles.quote} numberOfLines={source.long && !expanded ? 3 : undefined}>
        {source.text}
      </AppText>
      {source.long && <Button label={expanded ? copy.review.sourceCollapse : copy.review.sourceExpand} variant="ghost" size="sm" onPress={() => setExpanded((v) => !v)} />}
    </Card>
  );
}

function Facts({ fields }: { fields: ProposalVM['fields'] }) {
  return (
    <View>
      {fields.map((field) => (
        <View key={field.label} style={styles.fact}>
          <AppText variant="metadata" color={color.text.muted}>
            {field.label}
          </AppText>
          <AppText variant="body">{field.value}</AppText>
        </View>
      ))}
    </View>
  );
}

function AreaChips({ area, onChange }: { area: NonNullable<ProposalVM['area']>; onChange: (categoryId: string) => void }) {
  return (
    <View style={styles.block}>
      <AppText variant="metadata" color={area.needed ? color.status.attention : color.text.muted}>
        {area.needed ? copy.review.areaNeeded : copy.review.fieldArea}
      </AppText>
      <View style={styles.chips}>
        {area.options.map((option) => (
          <ChipToggle key={option.id} label={option.name} selected={area.selectedId === option.id} onPress={() => onChange(option.id)} />
        ))}
      </View>
    </View>
  );
}

// ------------------------------------------------------------ a reading to review ---

function ProposalCard({
  vm,
  onAccept,
  onReject,
  onFix,
  onArea,
  busy,
}: {
  vm: ProposalVM;
  onAccept: () => void;
  onReject: () => void;
  onFix: () => void;
  onArea: (categoryId: string) => void;
  busy: boolean;
}) {
  const [why, setWhy] = useState(false);
  return (
    <Card tone="surface" style={styles.card}>
      <View style={styles.header}>
        <Overline color={color.ai.insight}>{copy.review.eyebrow}</Overline>
        {vm.confidence && <ConfidenceBadge level={vm.confidence} />}
      </View>
      <AppText variant="metadata" color={color.text.muted} style={styles.kind}>
        {vm.kindLabel}
      </AppText>
      <Facts fields={vm.fields} />
      {vm.notes.map((note) => (
        <AppText key={note} variant="supporting" color={color.text.secondary} style={styles.note}>
          {note}
        </AppText>
      ))}
      {vm.area && <AreaChips area={vm.area} onChange={onArea} />}
      {vm.evidence.length > 0 && (
        <View style={styles.block}>
          <Button label={why ? copy.review.whyHide : copy.review.whyToggle} variant="ghost" size="sm" onPress={() => setWhy((v) => !v)} />
          {why && <WhyThis reasons={vm.evidence} />}
        </View>
      )}
      <ProvenanceLabel source={vm.provenance} />
      <View style={styles.actions}>
        <Button label={copy.review.accept} onPress={onAccept} disabled={!vm.actions.canAccept || busy} accessibilityHint={vm.actions.canAccept ? undefined : copy.review.areaNeeded} />
        <Button label={copy.review.reject} variant="secondary" onPress={onReject} disabled={!vm.actions.canReject || busy} />
        <Button label={copy.review.fix} variant="ghost" onPress={onFix} disabled={!vm.actions.canFix || busy} />
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------- a question ---

function ClarificationChoice({
  vm,
  question,
  failures,
  onAnswer,
  onReject,
  onFix,
  busy,
}: {
  vm: ProposalVM;
  question: QuestionVM;
  failures: number;
  onAnswer: (answer: ClarificationAnswer) => void;
  onReject: () => void;
  onFix: () => void;
  busy: boolean;
}) {
  const [text, setText] = useState('');
  return (
    <Card tone="surface" style={styles.card}>
      <Overline color={color.ai.insight}>{copy.clarify.eyebrow}</Overline>
      <AppText variant="body" style={styles.prompt}>
        {question.prompt}
      </AppText>
      <AppText variant="supporting" color={color.text.secondary} style={styles.note}>
        {vm.title}
      </AppText>
      <View style={styles.chips}>
        {question.options.map((option) => (
          <Button key={option.key} label={option.label} variant="secondary" size="sm" disabled={busy} onPress={() => onAnswer({ kind: 'option', option: option.option })} style={styles.option} />
        ))}
      </View>
      {question.remainingLabel && (
        <AppText variant="metadata" color={color.text.muted}>
          {question.remainingLabel}
        </AppText>
      )}
      {!question.exhausted && (
        <View style={styles.block}>
          <TextField label={copy.clarify.answerPlaceholder} value={text} onChangeText={setText} />
          <Button
            label={copy.clarify.send}
            size="sm"
            disabled={busy || text.trim().length === 0}
            onPress={() => {
              onAnswer({ kind: 'text', text });
              setText('');
            }}
          />
        </View>
      )}
      {failures > 0 && !question.exhausted && (
        <AppText variant="supporting" color={color.text.secondary} style={styles.note}>
          {copy.clarify.notUnderstood}
        </AppText>
      )}
      {question.exhausted && <InlineNotice tone="attention" title={copy.clarify.exhausted} style={styles.block} />}
      <View style={styles.actions}>
        <Button label={copy.review.fix} variant="ghost" size="sm" onPress={onFix} disabled={busy} />
        <Button label={copy.review.reject} variant="ghost" size="sm" onPress={onReject} disabled={busy} />
      </View>
    </Card>
  );
}

// ------------------------------------------------------------------ fix sheet ---

const KIND_CHOICES: Array<{ kind: ProposalKind; label: string }> = [
  { kind: 'event', label: copy.fix.kindEvent },
  { kind: 'task', label: copy.fix.kindTask },
  { kind: 'needsMe', label: copy.fix.kindNote },
];

function FixSheet({ readingId, onClose, onFixed }: { readingId: string; onClose: () => void; onFixed: (message: string) => void }) {
  const { coordinator, now } = useCapture();
  const { state } = useStoreSnapshot();
  const reading = state?.interpretations.find((r) => r.id === readingId);
  const initial = reading && state ? initialForm(reading, state) : null;
  const [form, setForm] = useState<FixForm | null>(initial);
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!state || !reading || !initial || !form) return null;
  const today = logicalDateAt(now(), state.user.timezone);
  const set = (patch: Partial<FixForm>) => setForm({ ...form, ...patch });

  async function apply() {
    if (!form || !initial) return;
    setBusy(true);
    setProblem(null);
    let outcome;
    if (said.trim().length > 0) {
      outcome = await coordinator.correct(readingId, { kind: 'text', text: said });
    } else {
      const result = patchFromForm(form, initial);
      if (result.kind === 'unchanged') {
        setBusy(false);
        onClose();
        return;
      }
      if (result.kind === 'error') {
        setBusy(false);
        setProblem(result.field === 'kind' ? copy.fix.cannot : copy.fix.notUnderstood);
        return;
      }
      outcome = await coordinator.correct(readingId, { kind: 'patch', patch: result.patch });
    }
    setBusy(false);
    if (outcome.kind === 'revised') {
      onFixed(copy.fix.saved);
      onClose();
    } else if (outcome.kind === 'not-understood') setProblem(outcome.exhausted ? copy.fix.exhausted : copy.fix.notUnderstood);
    else if (outcome.kind === 'not-saved') setProblem(copy.capture.notSaved);
    else onClose();
  }

  return (
    <Sheet visible onClose={onClose} accessibilityLabel={copy.fix.title}>
      <AppText variant="sectionTitle" accessibilityRole="header">
        {copy.fix.title}
      </AppText>
      <View style={styles.block}>
        <TextField label={copy.fix.sayIt} value={said} onChangeText={setSaid} placeholder={copy.fix.sayItPlaceholder} />
      </View>
      <TextField label={copy.fix.labelTitle} value={form.title} onChangeText={(title) => set({ title })} />
      <AppText variant="metadata" color={color.text.muted}>
        {copy.fix.labelKind}
      </AppText>
      <View style={styles.chips}>
        {KIND_CHOICES.map((choice) => (
          <ChipToggle key={choice.kind} label={choice.label} selected={form.kind === choice.kind} onPress={() => set({ kind: choice.kind })} />
        ))}
      </View>
      <AppText variant="metadata" color={color.text.muted}>
        {copy.fix.labelDay}
      </AppText>
      <View style={styles.chips}>
        {dayChoices(today).map((choice) => (
          <ChipToggle key={choice.date} label={choice.label} selected={form.date === choice.date} onPress={() => set({ date: choice.date })} />
        ))}
      </View>
      {form.kind === 'event' && <TextField label={copy.fix.labelTime} value={form.timeText} onChangeText={(timeText) => set({ timeText })} placeholder={copy.fix.timeHint} />}
      {form.kind !== 'needsMe' && (
        <>
          <TextField label={copy.fix.labelAmount} value={form.amountText} onChangeText={(amountText) => set({ amountText })} placeholder={copy.fix.amountHint} keyboardType="decimal-pad" />
          <AppText variant="metadata" color={color.text.muted}>
            {copy.fix.amountDirection}
          </AppText>
          <View style={styles.chips}>
            <ChipToggle label={copy.clarify.optionPay} selected={form.direction === 'outflow'} onPress={() => set({ direction: 'outflow' })} />
            <ChipToggle label={copy.clarify.optionOwed} selected={form.direction === 'inflow'} onPress={() => set({ direction: 'inflow' })} />
          </View>
          {state.children.length > 0 && (
            <>
              <AppText variant="metadata" color={color.text.muted}>
                {copy.fix.labelChild}
              </AppText>
              <View style={styles.chips}>
                {state.children.map((child) => (
                  <ChipToggle key={child.id} label={child.displayName} selected={form.subject === `child:${child.id}`} onPress={() => set({ subject: `child:${child.id}` })} />
                ))}
                <ChipToggle label={copy.review.noChild} selected={form.subject === 'none'} onPress={() => set({ subject: 'none' })} />
              </View>
            </>
          )}
        </>
      )}
      {problem && <InlineNotice tone="attention" title={problem} style={styles.block} />}
      <View style={styles.actions}>
        <Button label={copy.fix.apply} onPress={apply} disabled={busy} />
        <Button label={copy.fix.cancel} variant="ghost" onPress={onClose} disabled={busy} />
      </View>
    </Sheet>
  );
}

// ------------------------------------------------------------- a whole capture ---

/**
 * One capture, reviewed: her words (while the session holds them), what Her Keys understood, and each
 * reading's own accept / reject / fix / answer. Readings resolve independently; the source is not
 * "resolved" until every reading has a final disposition.
 */
export function CaptureGroup({ captureId, onLater, showSource = true }: { captureId: string; onLater?: () => void; showSource?: boolean }) {
  const { coordinator } = useCapture();
  const [areaChoice, setAreaChoice] = useState<Record<string, string>>({});
  const [failures, setFailures] = useState<Record<string, number>>({});
  const [fixing, setFixing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const vm = useCaptureVM(captureId, { areaChoice, failures });
  if (!vm) return null;

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setMessage(await action());
    setBusy(false);
  }

  const accept = (readingId: string) =>
    run(async () => {
      const outcome = await coordinator.accept(readingId, { categoryId: areaChoice[readingId] });
      if (outcome.kind === 'not-saved') return copy.capture.notSaved;
      if (outcome.kind === 'needs-area') return copy.review.areaNeeded;
      return null;
    });

  const answer = (readingId: string, value: ClarificationAnswer) =>
    run(async () => {
      const outcome = await coordinator.answerClarification(readingId, value);
      if (outcome.kind === 'not-understood') {
        setFailures((f) => ({ ...f, [readingId]: outcome.attempts }));
        return copy.clarify.notUnderstood;
      }
      return outcome.kind === 'not-saved' ? copy.capture.notSaved : null;
    });

  return (
    <View>
      {showSource && <SourceEcho source={vm.source} />}

      {vm.hollow && (
        <InlineNotice
          tone="waiting"
          title={copy.inbox.hollow(vm.receivedLabel)}
          style={styles.block}
        />
      )}

      {vm.proposals.map((p) =>
        p.phase === 'clarifying' && p.question ? (
          <ClarificationChoice
            key={p.readingId}
            vm={p}
            question={p.question}
            failures={failures[p.readingId] ?? 0}
            busy={busy}
            onAnswer={(value) => answer(p.readingId, value)}
            onReject={() => run(async () => ((await coordinator.reject(p.readingId)).kind === 'not-saved' ? copy.capture.notSaved : null))}
            onFix={() => setFixing(p.readingId)}
          />
        ) : p.phase === 'clarifying' || p.phase === 'ready' ? (
          <ProposalCard
            key={p.readingId}
            vm={p}
            busy={busy}
            onAccept={() => accept(p.readingId)}
            onReject={() => run(async () => ((await coordinator.reject(p.readingId)).kind === 'not-saved' ? copy.capture.notSaved : null))}
            onFix={() => setFixing(p.readingId)}
            onArea={(categoryId) => setAreaChoice((c) => ({ ...c, [p.readingId]: categoryId }))}
          />
        ) : (
          <AppText key={p.readingId} variant="supporting" color={color.text.secondary} style={styles.decided}>
            {copy.review.decidedTitle(p.kindLabel, p.title)} · {p.outcomeLine}
          </AppText>
        )
      )}

      {vm.sessionNotes.map((note) => (
        <InlineNotice key={note} tone="info" title={note} style={styles.block} />
      ))}

      <View accessibilityLiveRegion="polite">{message && <InlineNotice tone="attention" title={message} style={styles.block} />}</View>

      {(vm.actions.canRetry || vm.actions.canDismiss) && (
        <View style={styles.actions}>
          {vm.actions.canRetry && <Button label={copy.inbox.retry} variant="secondary" size="sm" disabled={busy} onPress={() => run(async () => ((await coordinator.interpretCapture(captureId)).kind === 'not-saved' ? copy.capture.notSaved : null))} />}
          {onLater && vm.phase !== 'resolved' && <Button label={copy.capture.keptForLater} variant="ghost" size="sm" onPress={onLater} accessibilityHint={copy.capture.keptForLaterHint} />}
          {vm.actions.canDismiss && <Button label={copy.inbox.dismiss} variant="ghost" size="sm" disabled={busy} onPress={() => run(async () => ((await coordinator.dismissCapture(captureId)).kind === 'not-saved' ? copy.capture.notSaved : null))} />}
        </View>
      )}

      {fixing && <FixSheet readingId={fixing} onClose={() => setFixing(null)} onFixed={setMessage} />}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.md },
  card: { marginTop: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kind: { marginTop: spacing.sm },
  fact: { marginTop: spacing.md },
  quote: { marginTop: spacing.sm },
  note: { marginTop: spacing.sm },
  prompt: { marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm, gap: spacing.sm },
  option: { paddingHorizontal: spacing.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center', marginTop: spacing.lg },
  decided: { marginTop: spacing.md },
});
