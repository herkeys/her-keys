import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, ChipToggle, Overline, Sheet, TextField } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { OCR_DATE_TARGETS, type OcrAssignment, type OcrCandidate, type OcrDateTarget, EMPTY_OCR_ASSIGNMENT } from './ocrCandidate';
import { OCR_COPY as COPY } from './ocrCopy';
import { recordDate, recordDateLong } from './lifeAdminDates';
import type { RecordSheetValues } from './RecordSheet';
import { maskReference } from './sensitive';

const DATE_FIELD_LABEL: Record<OcrDateTarget, string> = {
  expiresOn: COPY.fieldExpires,
  renewBy: COPY.fieldRenewBy,
  reviewOn: COPY.fieldReviewOn,
};

export interface OcrReviewScreenProps {
  visible: boolean;
  /** What one scan produced. Read-only here: this screen only ever reads and assigns, never re-extracts or persists it. */
  candidate: OcrCandidate;
  /** Called once, with only the fields she assigned or typed. Opens the existing Add-record form; nothing is saved by this call. */
  onUseValues: (values: Partial<RecordSheetValues>) => void;
  /** Skips straight to a blank Add-record form, discarding every candidate. */
  onManualEntry: () => void;
  /** Discards the photo and every candidate. Nothing is saved. */
  onCancel: () => void;
}

/**
 * Assign, edit or skip what Her Keys read — never saved by this screen. "Continue to record" hands her choices to the same
 * Add-record form manual entry already uses, and only that form's own Save writes anything. A date's nearby text ("Expires…") is
 * shown once as a hint on the candidate itself; it never chooses a field for her, and choosing one field never removes a
 * candidate from the others.
 */
export function OcrReviewScreen({ visible, candidate, onUseValues, onManualEntry, onCancel }: OcrReviewScreenProps) {
  const [assignment, setAssignment] = useState<OcrAssignment>(EMPTY_OCR_ASSIGNMENT);
  const [issuerText, setIssuerText] = useState('');
  const [referenceText, setReferenceText] = useState('');
  const [revealedReference, setRevealedReference] = useState<Set<string>>(new Set());

  const assign = <K extends keyof OcrAssignment>(key: K, value: OcrAssignment[K]) => setAssignment((current) => ({ ...current, [key]: value }));

  const useIssuer = (text: string) => {
    setIssuerText(text);
    assign('issuerName', text.trim().length > 0 ? text : null);
  };
  const useReference = (text: string) => {
    setReferenceText(text);
    assign('referenceNumber', text.trim().length > 0 ? text : null);
  };
  const toggleReveal = (text: string) =>
    setRevealedReference((current) => {
      const next = new Set(current);
      if (next.has(text)) next.delete(text);
      else next.add(text);
      return next;
    });

  const handleContinue = () => {
    const values: Partial<RecordSheetValues> = {};
    for (const field of OCR_DATE_TARGETS) {
      const value = assignment[field];
      if (value) values[field] = value;
    }
    if (assignment.issuerName) values.issuerName = assignment.issuerName;
    if (assignment.referenceNumber) values.referenceNumber = assignment.referenceNumber;
    onUseValues(values);
  };

  return (
    <Sheet visible={visible} onClose={onCancel} accessibilityLabel={COPY.reviewTitle}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Overline>{COPY.readByHerKeys}</Overline>
        <AppText variant="sectionTitle">{COPY.reviewTitle}</AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.intro}>
          {COPY.reviewIntro}
        </AppText>

        <View style={styles.block}>
          <Overline>{COPY.datesHeading}</Overline>
          {candidate.dates.length === 0 ? (
            <AppText variant="supporting" color={colors.textSecondary}>
              {COPY.noDatesRead}
            </AppText>
          ) : (
            <View accessibilityRole="list">
              {candidate.dates.map((d) => (
                <AppText
                  key={d.date}
                  variant="supporting"
                  color={colors.textSecondary}
                  style={styles.candidateLine}
                  accessibilityLabel={COPY.unconfirmedCandidate(recordDateLong(d.date))}
                >
                  {recordDate(d.date)}
                  {d.context ? ` — “${d.context}”` : ''}
                </AppText>
              ))}
            </View>
          )}

          {OCR_DATE_TARGETS.map((field) => (
            <DateFieldPicker
              key={field}
              label={DATE_FIELD_LABEL[field]}
              candidates={candidate.dates.map((d) => d.date)}
              selected={assignment[field]}
              onSelect={(value) => assign(field, value)}
            />
          ))}
        </View>

        <View style={styles.block}>
          <Overline>{COPY.issuersHeading}</Overline>
          {candidate.issuers.length === 0 ? (
            <AppText variant="supporting" color={colors.textSecondary}>
              {COPY.noIssuersRead}
            </AppText>
          ) : (
            <View style={styles.chips} accessibilityRole="list">
              {candidate.issuers.map((c) => (
                <ChipToggle key={c.text} label={c.text} selected={issuerText === c.text} onPress={() => useIssuer(c.text)} />
              ))}
              <ChipToggle label={COPY.none} selected={issuerText === '' && assignment.issuerName === null} onPress={() => useIssuer('')} />
            </View>
          )}
          <TextField label={COPY.fieldIssuer} value={issuerText} onChangeText={useIssuer} placeholder={COPY.enterManually} maxLength={120} />
        </View>

        <View style={styles.block}>
          <Overline>{COPY.referencesHeading}</Overline>
          {candidate.references.length === 0 ? (
            <AppText variant="supporting" color={colors.textSecondary}>
              {COPY.noReferencesRead}
            </AppText>
          ) : (
            <View style={styles.chips} accessibilityRole="list">
              {candidate.references.map((c) => {
                const shown = revealedReference.has(c.text) ? c.text : (maskReference(c.text) ?? c.text);
                return (
                  <View key={c.text} style={styles.referenceRow}>
                    <ChipToggle label={shown} selected={referenceText === c.text} onPress={() => useReference(c.text)} />
                    <Button
                      label={revealedReference.has(c.text) ? COPY.hide : COPY.reveal}
                      variant="ghost"
                      size="sm"
                      onPress={() => toggleReveal(c.text)}
                    />
                  </View>
                );
              })}
              <ChipToggle label={COPY.none} selected={referenceText === '' && assignment.referenceNumber === null} onPress={() => useReference('')} />
            </View>
          )}
          <TextField label={COPY.fieldReference} value={referenceText} onChangeText={useReference} placeholder={COPY.enterManually} maxLength={64} />
        </View>

        <AppText variant="supporting" color={colors.textSecondary} style={styles.block}>
          {COPY.nothingSavedYet}
        </AppText>

        <View style={styles.actions}>
          <Button label={COPY.cancelScan} variant="ghost" onPress={onCancel} accessibilityHint={COPY.cancelScanHint} />
          <Button label={COPY.enterManuallyInstead} variant="secondary" onPress={onManualEntry} />
          <Button label={COPY.continueToRecord} onPress={handleContinue} accessibilityHint={COPY.continueHint} />
        </View>
      </ScrollView>
    </Sheet>
  );
}

interface DateFieldPickerProps {
  label: string;
  candidates: readonly string[];
  selected: string | null;
  onSelect: (value: string | null) => void;
}

/** One F12 date field, offered every candidate date plus manual entry and none — never pre-picked. */
function DateFieldPicker({ label, candidates, selected, onSelect }: DateFieldPickerProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState('');
  const stateLabel = selected ? COPY.setTo(recordDateLong(selected)) : COPY.notSet;

  return (
    <View style={styles.fieldBlock}>
      <Overline>{`${label} — ${stateLabel}`}</Overline>
      <View style={styles.chips} accessibilityRole="list">
        {candidates.map((date) => (
          <ChipToggle
            key={date}
            label={recordDate(date)}
            selected={selected === date}
            onPress={() => {
              setManualOpen(false);
              onSelect(date);
            }}
          />
        ))}
        <ChipToggle
          label={COPY.enterManually}
          selected={manualOpen}
          onPress={() => {
            setManualOpen(true);
            onSelect(null);
          }}
        />
        <ChipToggle label={COPY.none} selected={!manualOpen && selected === null} onPress={() => { setManualOpen(false); onSelect(null); }} />
      </View>
      {manualOpen ? (
        <TextField
          label={label}
          value={manualText}
          onChangeText={(text) => {
            setManualText(text);
            onSelect(text.trim().length > 0 ? text.trim() : null);
          }}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 600 },
  intro: { marginTop: spacing.sm },
  block: { marginTop: spacing.lg },
  fieldBlock: { marginTop: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  candidateLine: { marginTop: spacing.xs },
  referenceRow: { flexDirection: 'row', alignItems: 'center', marginRight: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl },
});
