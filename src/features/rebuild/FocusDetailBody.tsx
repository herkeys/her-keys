import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, ChipToggle, EmptyState, InlineNotice, LoadingState, Overline, StatusList, TextField } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { REBUILD_FOCUS_NOTE_MAX, REBUILD_FOCUS_TITLE_MAX, type RebuildFocusState } from '../../domain/rebuild/schema';
import { FIELD_LIMITS } from '../../domain/state';
import type { RebuildAvailability } from './availability';
import { REBUILD_COPY } from './copy';
import type { FocusDetailView } from './model';

export interface FocusDetailHandlers {
  onRename: (title: string) => Promise<boolean>;
  onSaveNote: (note: string | null) => Promise<boolean>;
  onSetState: (next: RebuildFocusState) => Promise<boolean>;
  /** Saves ONE canonical Task plus its next-action link. The form calls this only when she saves; opening it calls nothing. */
  onAddStep: (input: { title: string; categoryId: string }) => Promise<boolean>;
  onMarkDone: (taskId: string) => Promise<boolean>;
  onEditStep: (taskId: string) => void;
  onConnect: (target: { kind: 'system' | 'event'; id: string }) => Promise<boolean>;
  onDisconnect: (linkId: string) => Promise<boolean>;
}

export interface FocusDetailBodyProps extends FocusDetailHandlers {
  gate: RebuildAvailability;
  view: FocusDetailView | null;
  /** Arriving from "Add a next step" on the home: the form starts open. Still nothing is created until Save. */
  startWithStepForm?: boolean;
}

const C = REBUILD_COPY.detail;

export function FocusDetailBody(props: FocusDetailBodyProps) {
  const { gate, view } = props;
  if (gate.kind === 'loading') return <LoadingState label={REBUILD_COPY.availability.loading} />;
  if (gate.kind === 'unrecovered') return <EmptyState title={REBUILD_COPY.availability.unrecoveredTitle} body={REBUILD_COPY.availability.unrecoveredBody} />;
  if (gate.kind === 'other_account') return <EmptyState title={REBUILD_COPY.availability.otherAccountTitle} body={REBUILD_COPY.availability.otherAccountBody} />;
  if (view === null) return <EmptyState title={C.notFoundTitle} body={C.notFoundBody} />;
  return <ReadyDetail {...props} view={view} canWrite={gate.canWrite} />;
}

type Editing = 'none' | 'rename' | 'note' | 'archive';

function ReadyDetail({
  view,
  canWrite,
  startWithStepForm = false,
  onRename,
  onSaveNote,
  onSetState,
  onAddStep,
  onMarkDone,
  onEditStep,
  onConnect,
  onDisconnect,
}: FocusDetailBodyProps & { view: FocusDetailView; canWrite: boolean }) {
  const [editing, setEditing] = useState<Editing>('none');
  const [titleDraft, setTitleDraft] = useState(view.title);
  const [noteDraft, setNoteDraft] = useState(view.note ?? '');
  const [stepOpen, setStepOpen] = useState(startWithStepForm && view.canAddNextStep);
  const [stepTitle, setStepTitle] = useState('');
  const [stepCategory, setStepCategory] = useState<string | null>(view.defaultCategoryId);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  /** One write at a time; a failure says so and keeps what she typed. */
  const run = async (write: () => Promise<boolean>, after?: () => void) => {
    if (inFlight.current || !canWrite) return;
    inFlight.current = true;
    setFailed(false);
    const ok = await write();
    inFlight.current = false;
    if (ok) after?.();
    else setFailed(true);
  };

  const archived = view.state === 'archived';
  const stateLine = view.state === 'active' ? C.stateActive : view.state === 'paused' ? C.statePaused : C.stateArchived;
  const stepReady = stepTitle.trim().length > 0 && stepCategory !== null;

  return (
    <View>
      {!canWrite && <InlineNotice tone="waiting" title={REBUILD_COPY.availability.readOnly} style={styles.notice} />}
      {failed && (
        <AppText variant="supporting" color={colors.attention} accessibilityRole="alert" style={styles.notice}>
          {C.saveFailed}
        </AppText>
      )}

      {/* Her Focus, in her words: the only place its note is ever shown. */}
      {editing === 'rename' ? (
        <View style={styles.block}>
          <TextField label={C.renameLabel} value={titleDraft} onChangeText={setTitleDraft} maxLength={REBUILD_FOCUS_TITLE_MAX} autoFocus />
          <View style={styles.row}>
            <Button label={C.saveRename} size="sm" disabled={titleDraft.trim().length === 0 || !canWrite} onPress={() => run(() => onRename(titleDraft), () => setEditing('none'))} />
            <Button label={C.cancel} size="sm" variant="ghost" onPress={() => { setTitleDraft(view.title); setEditing('none'); }} />
          </View>
        </View>
      ) : (
        <View style={styles.block}>
          <AppText variant="screenTitle">{view.title}</AppText>
          <AppText variant="metadata" color={colors.textSecondary} style={styles.stateLine}>
            {stateLine}
          </AppText>
          {view.note !== null && editing !== 'note' && (
            <AppText variant="body" color={colors.textSecondary} style={styles.note}>
              {view.note}
            </AppText>
          )}
        </View>
      )}

      {editing === 'note' && (
        <View style={styles.block}>
          <TextField label={C.noteLabel} value={noteDraft} onChangeText={setNoteDraft} maxLength={REBUILD_FOCUS_NOTE_MAX} multiline autoFocus />
          <View style={styles.row}>
            <Button label={C.saveNote} size="sm" disabled={!canWrite} onPress={() => run(() => onSaveNote(noteDraft.trim().length === 0 ? null : noteDraft), () => setEditing('none'))} />
            {view.note !== null && <Button label={C.clearNote} size="sm" variant="ghost" disabled={!canWrite} onPress={() => run(() => onSaveNote(null), () => { setNoteDraft(''); setEditing('none'); })} />}
            <Button label={C.cancel} size="sm" variant="ghost" onPress={() => { setNoteDraft(view.note ?? ''); setEditing('none'); }} />
          </View>
        </View>
      )}

      {editing === 'none' && (
        <View style={[styles.row, styles.block]}>
          <Button label={C.rename} size="sm" variant="secondary" disabled={!canWrite} onPress={() => setEditing('rename')} />
          <Button label={view.note === null ? C.addNote : C.editNote} size="sm" variant="secondary" disabled={!canWrite} onPress={() => setEditing('note')} />
        </View>
      )}

      {/* Next steps: canonical Tasks she chose. */}
      <View style={styles.section}>
        <Overline style={styles.label}>{C.nextSteps}</Overline>
        {view.steps.map((step) => (
          <Card key={step.taskId} tone="subtle" style={styles.stepCard}>
            <AppText variant="bodyStrong">{step.title}</AppText>
            {step.dateLabel !== null && <AppText variant="metadata" color={colors.textSecondary}>{step.dateLabel}</AppText>}
            {step.lighterVersion !== null && (
              <AppText variant="metadata" color={colors.textSecondary}>{REBUILD_COPY.home.lighterVersion(step.lighterVersion)}</AppText>
            )}
            <View style={[styles.row, styles.stepActions]}>
              <Button label={C.markDone} size="sm" variant="secondary" accessibilityHint={step.title} disabled={!canWrite} onPress={() => run(() => onMarkDone(step.taskId))} />
              <Button label={C.editStep} size="sm" variant="ghost" accessibilityHint={step.title} onPress={() => onEditStep(step.taskId)} />
            </View>
          </Card>
        ))}

        {view.canAddNextStep && !stepOpen && (
          <View style={styles.row}>
            <Button label={REBUILD_COPY.home.addNextStep} size="sm" variant="ghost" disabled={!canWrite} onPress={() => setStepOpen(true)} />
          </View>
        )}

        {stepOpen && (
          <Card style={styles.stepCard}>
            <TextField label={C.stepLabel} value={stepTitle} onChangeText={setStepTitle} placeholder={C.stepPlaceholder} maxLength={FIELD_LIMITS.titleLength} autoFocus />
            <AppText variant="metadata" color={colors.textSecondary} style={styles.hint}>
              {C.stepHint}
            </AppText>
            <Overline style={styles.label}>{C.categoryLabel}</Overline>
            <View style={styles.chips}>
              {view.categories.map((category) => (
                <ChipToggle key={category.id} label={category.name} selected={stepCategory === category.id} onPress={() => setStepCategory(category.id)} />
              ))}
            </View>
            <View style={styles.row}>
              <Button
                label={C.saveStep}
                size="sm"
                disabled={!stepReady || !canWrite}
                onPress={() => run(() => onAddStep({ title: stepTitle, categoryId: stepCategory! }), () => { setStepTitle(''); setStepOpen(false); })}
              />
              <Button label={C.cancel} size="sm" variant="ghost" onPress={() => { setStepTitle(''); setStepOpen(false); }} />
            </View>
          </Card>
        )}
      </View>

      {view.connections.length > 0 && (
        <View style={styles.section}>
          <Overline style={styles.label}>{C.connected}</Overline>
          {view.connections.map((connection) => (
            <View key={connection.linkId} style={styles.connection}>
              <View style={styles.connectionText}>
                <AppText variant="metadata" color={colors.textSecondary}>{connection.kindLabel}</AppText>
                <AppText variant="body">{connection.title}</AppText>
                {connection.detail !== null && <AppText variant="metadata" color={colors.textSecondary}>{connection.detail}</AppText>}
              </View>
              <Button label={C.disconnect} size="sm" variant="ghost" accessibilityHint={connection.title} disabled={!canWrite} onPress={() => run(() => onDisconnect(connection.linkId))} />
            </View>
          ))}
        </View>
      )}

      {!archived && (view.connectRoutines.length > 0 || view.connectUpcoming.length > 0) && (
        <View style={styles.section}>
          <Overline style={styles.label}>{C.connect}</Overline>
          {view.connectRoutines.length > 0 && (
            <View style={styles.block}>
              <AppText variant="metadata" color={colors.textSecondary} style={styles.hint}>{C.connectRoutines}</AppText>
              <StatusList
                items={view.connectRoutines.map((c) => ({ key: `system:${c.id}`, label: c.title, value: C.connectAction, accessibilityLabel: `${C.connectAction} ${c.title}`, onPress: canWrite ? () => void run(() => onConnect({ kind: 'system', id: c.id })) : undefined }))}
              />
            </View>
          )}
          {view.connectUpcoming.length > 0 && (
            <View style={styles.block}>
              <AppText variant="metadata" color={colors.textSecondary} style={styles.hint}>{C.connectUpcoming}</AppText>
              <StatusList
                items={view.connectUpcoming.map((c) => ({ key: `event:${c.id}`, label: c.detail === null ? c.title : `${c.title} — ${c.detail}`, value: C.connectAction, accessibilityLabel: `${C.connectAction} ${c.title}`, onPress: canWrite ? () => void run(() => onConnect({ kind: 'event', id: c.id })) : undefined }))}
              />
            </View>
          )}
        </View>
      )}

      {/* State: none of these is a judgment, and none reaches a linked item. */}
      {editing === 'archive' ? (
        <Card tone="subtle" style={styles.section}>
          <AppText variant="bodyStrong">{C.archiveConfirmTitle}</AppText>
          <AppText variant="supporting" color={colors.textSecondary} style={styles.hint}>{C.archiveConfirmBody}</AppText>
          <View style={styles.row}>
            <Button label={C.archiveConfirm} size="sm" variant="secondary" disabled={!canWrite} onPress={() => run(() => onSetState('archived'), () => setEditing('none'))} />
            <Button label={C.keep} size="sm" variant="ghost" onPress={() => setEditing('none')} />
          </View>
        </Card>
      ) : (
        <View style={[styles.row, styles.section]}>
          {view.state === 'active' && <Button label={C.pause} size="sm" variant="ghost" disabled={!canWrite} onPress={() => run(() => onSetState('paused'))} />}
          {view.state !== 'active' && <Button label={C.resume} size="sm" variant="ghost" disabled={!canWrite} onPress={() => run(() => onSetState('active'))} />}
          {!archived && <Button label={C.archive} size="sm" variant="ghost" disabled={!canWrite} onPress={() => setEditing('archive')} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { marginBottom: spacing.lg },
  block: { marginBottom: spacing.lg },
  stateLine: { marginTop: spacing.xs },
  note: { marginTop: spacing.md },
  section: { marginBottom: spacing.xxl },
  label: { marginBottom: spacing.md },
  stepCard: { marginBottom: spacing.md },
  stepActions: { marginTop: spacing.sm },
  hint: { marginBottom: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  connection: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  connectionText: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
});
