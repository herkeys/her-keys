import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { AppText, Button, Overline, Sheet } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { EMPTY_OCR_CANDIDATE, type OcrCandidate } from './ocrCandidate';
import { OCR_COPY as COPY } from './ocrCopy';
import { OcrReviewScreen } from './OcrReviewScreen';
import type { RecordSheetValues } from './RecordSheet';
import { cleanupAllTempScans, scanForCandidates, type ScanSource } from './ocrNativeAdapter';

type Phase = 'choose' | 'working' | 'review' | 'permission-denied' | 'error';

export interface ScanEntryPointProps {
  visible: boolean;
  /** Her assigned/edited values, ready to open the existing Add-record form. Nothing is saved by this call. */
  onUseValues: (values: Partial<RecordSheetValues>) => void;
  /** Skips straight to a blank Add-record form. */
  onManualEntry: () => void;
  /** Closes the whole scan flow. Discards the photo and every candidate; nothing is saved. */
  onClose: () => void;
}

/**
 * Take a photo or choose one, read it on this device, then hand the review screen what was read. If the app backgrounds while a
 * scan is in flight, the result is discarded on return rather than carried into review: nothing recognized while she was away is
 * trusted, and nothing is saved either way.
 */
export function ScanEntryPoint({ visible, onUseValues, onManualEntry, onClose }: ScanEntryPointProps) {
  const [phase, setPhase] = useState<Phase>('choose');
  const [candidate, setCandidate] = useState<OcrCandidate>(EMPTY_OCR_CANDIDATE);
  const [errorMessage, setErrorMessage] = useState('');
  const cleanupRef = useRef<(() => void) | null>(null);
  const backgroundedDuringScanRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setPhase('choose');
      backgroundedDuringScanRef.current = false;
    } else {
      cleanupRef.current?.();
      cleanupRef.current = null;
    }
  }, [visible]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && phase === 'working') backgroundedDuringScanRef.current = true;
    });
    return () => sub.remove();
  }, [phase]);

  useEffect(() => () => {
    // Unmounted with a scan result still pending cleanup (parent closed the sheet mid-review): remove the temp file rather
    // than leaving it behind. `cleanupAllTempScans` is also called so a crash between capture and this point never strands one.
    cleanupRef.current?.();
    cleanupAllTempScans();
  }, []);

  const runScan = async (source: ScanSource) => {
    setPhase('working');
    backgroundedDuringScanRef.current = false;
    const outcome = await scanForCandidates(source);

    if (backgroundedDuringScanRef.current) {
      // The app left the foreground while recognition was running. Whatever came back is not trusted: discard it, clear any
      // temp file it made, and return to a safe, unstarted state rather than continuing into review.
      if (outcome.kind === 'candidate') outcome.cleanup();
      setPhase('choose');
      return;
    }

    if (outcome.kind === 'candidate') {
      cleanupRef.current = outcome.cleanup;
      setCandidate(outcome.candidate);
      setPhase('review');
      return;
    }
    if (outcome.kind === 'cancelled') {
      onClose();
      return;
    }
    if (outcome.kind === 'permission-denied') {
      setPhase('permission-denied');
      return;
    }
    setErrorMessage(outcome.message);
    setPhase('error');
  };

  const finishReview = (values: Partial<RecordSheetValues>) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    onUseValues(values);
  };

  const discardScan = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    onClose();
  };

  if (phase === 'review') {
    return (
      <OcrReviewScreen
        visible={visible}
        candidate={candidate}
        onUseValues={finishReview}
        onManualEntry={() => {
          cleanupRef.current?.();
          cleanupRef.current = null;
          onManualEntry();
        }}
        onCancel={discardScan}
      />
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={COPY.actionSheetTitle}>
      <Overline>{COPY.scanEntry}</Overline>
      {phase === 'choose' ? (
        <View>
          <AppText variant="sectionTitle">{COPY.actionSheetTitle}</AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.body}>
            {COPY.scanEntryHint}
          </AppText>
          <View style={styles.actions}>
            <Button label={COPY.takePhoto} onPress={() => void runScan('camera')} />
            <Button label={COPY.choosePhoto} variant="secondary" onPress={() => void runScan('library')} />
            <Button label={COPY.enterManuallyInstead} variant="ghost" onPress={onManualEntry} />
            <Button label={COPY.cancel} variant="ghost" onPress={onClose} />
          </View>
        </View>
      ) : null}

      {phase === 'working' ? (
        <View accessibilityLiveRegion="polite" accessibilityRole="text">
          <AppText variant="sectionTitle">{COPY.reading}</AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.body}>
            {COPY.readingHint}
          </AppText>
        </View>
      ) : null}

      {phase === 'permission-denied' ? (
        <View accessibilityRole="alert">
          <AppText variant="sectionTitle">{COPY.permissionCameraTitle}</AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.body}>
            {COPY.permissionCameraBody}
          </AppText>
          <View style={styles.actions}>
            <Button label={COPY.choosePhoto} variant="secondary" onPress={() => void runScan('library')} />
            <Button label={COPY.enterManuallyInstead} onPress={onManualEntry} />
            <Button label={COPY.cancel} variant="ghost" onPress={onClose} />
          </View>
        </View>
      ) : null}

      {phase === 'error' ? (
        <View accessibilityRole="alert">
          <AppText variant="sectionTitle">{COPY.readError}</AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.body}>
            {errorMessage}
          </AppText>
          <View style={styles.actions}>
            <Button label={COPY.choosePhoto} variant="secondary" onPress={() => void runScan('library')} />
            <Button label={COPY.enterManuallyInstead} onPress={onManualEntry} />
            <Button label={COPY.cancel} variant="ghost" onPress={onClose} />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: spacing.sm },
  actions: { marginTop: spacing.xl, gap: spacing.sm, alignItems: 'flex-start' },
});
