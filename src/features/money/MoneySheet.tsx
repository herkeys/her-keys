import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, ChipToggle, InlineNotice, Overline, Sheet, TextField } from '../../design/components';
import { spacing } from '../../design/tokens';
import { isLocalDate, type LocalDate } from '../../domain/logicalDay';
import type { PaymentMechanism } from '../../domain/foundation/commitment';
import { MECHANISM_LABEL, MONEY_COPY } from './moneyCopy';
import type { MoneyItemFields } from './types';

export type MoneySheetMode = 'create' | 'edit';

export interface MoneySheetProps {
  visible: boolean;
  mode: MoneySheetMode;
  direction: 'outflow' | 'inflow';
  initial: MoneyItemFields;
  notice: string | null;
  busy: boolean;
  canWrite: boolean;
  childOptions: readonly { id: string; displayName: string }[];
  onSubmit: (fields: MoneyItemFields) => void;
  onClose: () => void;
  onResolve?: () => void;
  onCancel?: () => void;
  onDuplicateForward?: () => void;
}

const MECHANISM_CHOICES: readonly PaymentMechanism[] = ['manual', 'autopay'];

/**
 * Add or edit an obligation or an expected-income item. One sheet handles both, distinguished
 * only by `direction` (never a picker — see types.ts). Payment mechanism is offered only for an
 * obligation: it has no meaning for money arriving.
 */
export function MoneySheet(props: MoneySheetProps) {
  const { visible, mode, direction, initial, notice, busy, canWrite, childOptions, onSubmit, onClose, onResolve, onCancel, onDuplicateForward } = props;
  const [title, setTitle] = useState(initial.title);
  const [amountText, setAmountText] = useState(initial.amountText);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [mechanism, setMechanism] = useState<PaymentMechanism | null>(initial.paymentMechanism);
  const [childId, setChildId] = useState<string | null>(initial.childId);
  const [notes, setNotes] = useState(initial.notes);

  const isObligation = direction === 'outflow';
  const titleText = mode === 'edit' ? (isObligation ? MONEY_COPY.sheetEditObligationTitle : MONEY_COPY.sheetEditIncomeTitle) : isObligation ? MONEY_COPY.sheetAddObligationTitle : MONEY_COPY.sheetAddIncomeTitle;
  const dateError = dueDate.length > 0 && !isLocalDate(dueDate) ? MONEY_COPY.errDate : null;
  const amountNumber = Number(amountText);
  const amountError = amountText.length > 0 && (!Number.isFinite(amountNumber) || amountNumber <= 0) ? MONEY_COPY.errAmount : null;
  const canSave = canWrite && !busy && title.trim().length > 0 && amountText.trim().length > 0 && !amountError && isLocalDate(dueDate);

  const submit = () => onSubmit({ title, amountText, dueDate, paymentMechanism: isObligation ? mechanism : null, childId, notes });

  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={titleText}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <AppText variant="sectionTitle">{titleText}</AppText>
        {notice ? (
          <View style={styles.block}>
            <InlineNotice tone="waiting" title={notice} />
          </View>
        ) : null}

        <View style={styles.block}>
          <TextField label={MONEY_COPY.fieldTitle} value={title} onChangeText={setTitle} placeholder={MONEY_COPY.fieldTitlePlaceholder} maxLength={200} autoFocus={mode !== 'edit'} />
        </View>

        <View style={styles.block}>
          <TextField label={`${MONEY_COPY.fieldAmount} (USD)`} value={amountText} onChangeText={setAmountText} placeholder={MONEY_COPY.fieldAmountPlaceholder} keyboardType="decimal-pad" error={amountError} maxLength={15} />
        </View>

        <View style={styles.block}>
          <TextField
            label={isObligation ? MONEY_COPY.fieldDueDateObligation : MONEY_COPY.fieldDueDateIncome}
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="2026-09-25"
            keyboardType="numbers-and-punctuation"
            error={dateError}
            maxLength={10}
          />
        </View>

        {isObligation ? (
          <View style={styles.block}>
            <Overline>{MONEY_COPY.fieldMechanism}</Overline>
            <View style={styles.chips}>
              {MECHANISM_CHOICES.map((choice) => (
                <ChipToggle key={choice} label={MECHANISM_LABEL[choice as Exclude<PaymentMechanism, null>]} selected={mechanism === choice} onPress={() => setMechanism(mechanism === choice ? null : choice)} />
              ))}
            </View>
          </View>
        ) : null}

        {childOptions.length > 0 ? (
          <View style={styles.block}>
            <Overline>{MONEY_COPY.fieldChild}</Overline>
            <View style={styles.chips}>
              {childOptions.map((child) => (
                <ChipToggle key={child.id} label={child.displayName} selected={childId === child.id} onPress={() => setChildId(childId === child.id ? null : child.id)} />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.block}>
          <TextField label={MONEY_COPY.fieldNotes} value={notes} onChangeText={setNotes} multiline maxLength={1000} />
        </View>

        <View style={styles.actions}>
          <Button label={MONEY_COPY.cancel} variant="ghost" onPress={onClose} />
          <Button label={mode === 'edit' ? MONEY_COPY.saveChanges : MONEY_COPY.save} onPress={submit} disabled={!canSave} />
        </View>

        {mode === 'edit' ? (
          <View style={styles.more}>
            {onResolve ? <Button label={isObligation ? MONEY_COPY.markPaid : MONEY_COPY.markReceived} variant="secondary" size="sm" onPress={onResolve} disabled={!canWrite || busy} /> : null}
            {onDuplicateForward ? <Button label={MONEY_COPY.duplicateForward} variant="secondary" size="sm" onPress={onDuplicateForward} disabled={!canWrite || busy} /> : null}
            {onCancel ? <Button label={isObligation ? MONEY_COPY.cancelObligation : MONEY_COPY.cancelIncome} variant="ghost" size="sm" onPress={onCancel} disabled={!canWrite || busy} /> : null}
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 560 },
  block: { marginTop: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl },
  more: { marginTop: spacing.lg, gap: spacing.sm, alignItems: 'flex-start' },
});
