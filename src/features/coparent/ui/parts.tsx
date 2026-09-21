import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, ChipToggle, InlineNotice, Overline, Tag } from '../../../design/components';
import { colors, spacing } from '../../../design/tokens';
import { COPY } from '../copy';
import type { TransitionRowPresentation } from '../present';
import type { BlockedReason } from '../types';

/**
 * Small presentational building blocks for the Co-Parent Logistics screens. Props in, elements out: no state, no store, no
 * navigation, and no words of their own — every string is handed in from `COPY` or from a presentation object.
 */

/** Which part of a detail screen an action's error belongs to, so a refusal is shown where the tap happened. */
export interface AreaError {
  area: 'responsibility' | 'preparation' | 'manage';
  text: string;
}

export function Heading({ children }: { children: string }) {
  return (
    <AppText variant="sectionTitle" accessibilityRole="header" style={styles.heading}>
      {children}
    </AppText>
  );
}

export function Caption({ children }: { children: string }) {
  return (
    <AppText variant="metadata" color={colors.textTertiary}>
      {children}
    </AppText>
  );
}

export function Lines({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <View style={styles.lines}>
      {lines.map((line, index) => (
        <AppText key={`${index}:${line}`} variant="supporting" color={colors.textSecondary}>
          {line}
        </AppText>
      ))}
    </View>
  );
}

export function TagRow({ tags }: { tags: TransitionRowPresentation['tags'] }) {
  if (tags.length === 0) return null;
  return (
    <View style={styles.tags}>
      {tags.map((tag) => (
        <Tag key={tag.label} label={tag.label} tone={tag.tone} />
      ))}
    </View>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Heading>{title}</Heading>
      {children}
    </View>
  );
}

export function ErrorLine({ text }: { text: string | null | undefined }) {
  if (text === null || text === undefined || text === '') return null;
  return (
    <AppText variant="supporting" color={colors.attention} accessibilityRole="alert" style={styles.error}>
      {text}
    </AppText>
  );
}

export function FieldLabel({ children }: { children: string }) {
  return <Overline style={styles.fieldLabel}>{children}</Overline>;
}

export interface ChoiceOption {
  key: string;
  label: string;
}

/** A labelled group of single-choice chips. `selected` is null when nothing is chosen — an unanswered question stays unanswered. */
export function Choice({ label, options, selected, onSelect }: { label: string; options: readonly ChoiceOption[]; selected: string | null; onSelect: (key: string) => void }) {
  return (
    <View style={styles.group}>
      <FieldLabel>{label}</FieldLabel>
      <View style={styles.chips}>
        {options.map((option) => (
          <ChipToggle key={option.key} label={option.label} selected={option.key === selected} onPress={() => onSelect(option.key)} />
        ))}
      </View>
    </View>
  );
}

/** Why a new record cannot be made, worded by `COPY.blocked`. */
export function BlockedNotices({ codes }: { codes: readonly BlockedReason[] }) {
  return (
    <View style={styles.notices}>
      {codes.map((code) => (
        <InlineNotice key={code} title={COPY.blocked[code].title} body={COPY.blocked[code].body} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { marginBottom: spacing.sm },
  lines: { gap: spacing.xs, marginTop: spacing.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  section: { marginTop: spacing.xxl },
  error: { marginTop: spacing.sm },
  fieldLabel: { marginBottom: spacing.sm },
  group: { marginBottom: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  notices: { gap: spacing.md, marginBottom: spacing.xl },
});
