import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, ChipToggle, InlineNotice, Overline, Sheet, TextField } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { checkLifeRecordTitle } from '../../domain/lifeRecords';
import { isLocalDate } from '../../domain/logicalDay';
import { LIFE_RECORD_LIMITS, type LifeRecordKind } from '../../domain/state';
import { KIND_CHOICES, KIND_LABEL, LIFE_ADMIN_COPY as COPY } from './lifeAdminCopy';

/** The form's values, as typed. An empty string is "not set" and clears the field on save. */
export interface RecordSheetValues {
  title: string;
  kind: LifeRecordKind;
  typeName: string;
  issuerName: string;
  referenceNumber: string;
  issuedOn: string;
  expiresOn: string;
  renewBy: string;
  reviewOn: string;
  locationHint: string;
  note: string;
  subjectMemberId: string | null;
}

export const EMPTY_RECORD_VALUES: RecordSheetValues = {
  title: '',
  kind: 'other',
  typeName: '',
  issuerName: '',
  referenceNumber: '',
  issuedOn: '',
  expiresOn: '',
  renewBy: '',
  reviewOn: '',
  locationHint: '',
  note: '',
  subjectMemberId: null,
};

export interface RecordSheetProps {
  visible: boolean;
  mode: 'create' | 'edit';
  initial: RecordSheetValues;
  childOptions: ReadonlyArray<{ id: string; name: string }>;
  notice: string | null;
  busy: boolean;
  canWrite: boolean;
  onSubmit: (values: RecordSheetValues) => void;
  onClose: () => void;
}

const DATE_FIELDS = [
  ['issuedOn', COPY.fieldIssued],
  ['expiresOn', COPY.fieldExpires],
  ['renewBy', COPY.fieldRenewBy],
  ['reviewOn', COPY.fieldReviewOn],
] as const;

/**
 * Add or edit a record. A title (and the kind, which starts as "Other") is a complete record; everything else is behind "More
 * details" and optional forever. Clearing a field is emptying it. Dates are typed as YYYY-MM-DD and are only ever the dates she
 * types: nothing is suggested, derived or corrected, and no renewal window is invented.
 */
export function RecordSheet({ visible, mode, initial, childOptions, notice, busy, canWrite, onSubmit, onClose }: RecordSheetProps) {
  const [values, setValues] = useState<RecordSheetValues>(initial);
  const hasDetails = Object.entries(initial).some(([key, value]) => key !== 'title' && key !== 'kind' && value !== '' && value !== null);
  const [details, setDetails] = useState(mode === 'edit' || hasDetails);
  const set = <K extends keyof RecordSheetValues>(key: K, value: RecordSheetValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const dateError = (text: string) => (text.trim().length > 0 && !isLocalDate(text.trim()) ? COPY.errField.expiresOn : null);
  const datesOk = DATE_FIELDS.every(([key]) => dateError(values[key]) === null);
  const canSave = canWrite && !busy && checkLifeRecordTitle(values.title).ok && datesOk;
  const title = mode === 'edit' ? COPY.sheetEditTitle : COPY.sheetAddTitle;

  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={title}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <AppText variant="sectionTitle">{title}</AppText>
        {notice ? (
          <View style={styles.block}>
            <InlineNotice tone="waiting" title={notice} />
          </View>
        ) : null}

        <View style={styles.block}>
          <TextField label={COPY.fieldTitle} value={values.title} onChangeText={(text) => set('title', text)} placeholder={COPY.fieldTitlePlaceholder} maxLength={LIFE_RECORD_LIMITS.title} autoFocus={mode === 'create'} />
        </View>

        <View style={styles.block}>
          <Overline>{COPY.fieldKind}</Overline>
          <View style={styles.chips}>
            {KIND_CHOICES.map((kind) => (
              <ChipToggle key={kind} label={KIND_LABEL[kind]} selected={values.kind === kind} onPress={() => set('kind', kind)} />
            ))}
          </View>
        </View>

        <Button label={details ? COPY.fewerDetails : COPY.optionalDetails} variant="ghost" size="sm" onPress={() => setDetails((open) => !open)} style={styles.inline} />

        {details ? (
          <View>
            <View style={styles.block}>
              <TextField label={COPY.fieldType} value={values.typeName} onChangeText={(text) => set('typeName', text)} placeholder={COPY.fieldTypePlaceholder} maxLength={LIFE_RECORD_LIMITS.typeName} />
            </View>
            <View style={styles.block}>
              <TextField label={COPY.fieldIssuer} value={values.issuerName} onChangeText={(text) => set('issuerName', text)} placeholder={COPY.fieldIssuerPlaceholder} maxLength={LIFE_RECORD_LIMITS.issuerName} />
            </View>
            <View style={styles.block}>
              <TextField label={COPY.fieldReference} value={values.referenceNumber} onChangeText={(text) => set('referenceNumber', text)} placeholder={COPY.fieldReferencePlaceholder} maxLength={LIFE_RECORD_LIMITS.referenceNumber} />
              <AppText variant="supporting" color={colors.textSecondary}>
                {COPY.fieldReferenceHelp}
              </AppText>
            </View>
            {DATE_FIELDS.map(([key, label]) => (
              <View key={key} style={styles.block}>
                <TextField
                  label={label}
                  value={values[key]}
                  onChangeText={(text) => set(key, text)}
                  placeholder={COPY.fieldDatePlaceholder}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  error={dateError(values[key])}
                />
              </View>
            ))}
            <View style={styles.block}>
              <TextField label={COPY.fieldLocation} value={values.locationHint} onChangeText={(text) => set('locationHint', text)} placeholder={COPY.fieldLocationPlaceholder} maxLength={LIFE_RECORD_LIMITS.locationHint} />
            </View>
            <View style={styles.block}>
              <TextField label={COPY.fieldNote} value={values.note} onChangeText={(text) => set('note', text)} placeholder={COPY.fieldNotePlaceholder} maxLength={LIFE_RECORD_LIMITS.note} multiline />
            </View>
            {childOptions.length > 0 ? (
              <View style={styles.block}>
                <Overline>{COPY.fieldAbout}</Overline>
                <View style={styles.chips}>
                  <ChipToggle label={COPY.fieldNoChild} selected={values.subjectMemberId === null} onPress={() => set('subjectMemberId', null)} />
                  {childOptions.map((child) => (
                    <ChipToggle key={child.id} label={child.name} selected={values.subjectMemberId === child.id} onPress={() => set('subjectMemberId', child.id)} />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button label={COPY.cancel} variant="ghost" onPress={onClose} />
          <Button label={mode === 'edit' ? COPY.saveChanges : COPY.save} onPress={() => onSubmit(values)} disabled={!canSave} />
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 560 },
  block: { marginTop: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  inline: { alignSelf: 'flex-start', marginTop: spacing.md },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl },
});
