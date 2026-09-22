import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline, Tag } from '../../../design/components';
import { color, interaction, sizing, spacing } from '../../../design/tokens';
import type { LocalDate } from '../../../domain/logicalDay';
import {
  NOT_AUTHORIZATION,
  PLAN_LABEL,
  PLAN_SECTION_INTRO,
  PLAN_SECTION_TITLE,
  PLAN_STEP_ACTION,
  PLAN_TONE,
  openStepLabel,
  planReasonLine,
  whenPhrase,
} from '../copy';
import type { KidsRef, PlanRow } from '../types';
import { Disclosure } from './Disclosure';

/**
 * THE FALLBACK-PLANNING SURFACE (owner decision: an operational surface, NOT an authorization registry).
 *
 * It says, for each upcoming item, whether the arrangement around it holds - and where it does not, gives her a real next step using
 * the ordinary task mechanism. A step is work, never evidence: the label beside it does not move because a step exists. The note that
 * this is planning only is always on screen with the section, quietly, not as a warning.
 */
/** Where nothing is recorded there is little to say per row, so only the soonest few stay open; the rest fold away, never vanish. */
const UNDESCRIBED_SHOWN = 3;

export function FallbackPlanSection({
  plans,
  today,
  onOpenItem,
  onOpenStep,
  onAddStep,
}: {
  plans: PlanRow[];
  today: LocalDate;
  onOpenItem: (ref: KidsRef) => void;
  onOpenStep: (stepTaskId: string) => void;
  onAddStep: (parent: KidsRef) => void;
}) {
  if (plans.length === 0) return null;

  const described = plans.filter((row) => row.plan.reason !== 'nothing_recorded');
  const undescribed = plans.filter((row) => row.plan.reason === 'nothing_recorded');
  const shownUndescribed = undescribed.slice(0, UNDESCRIBED_SHOWN);
  const foldedUndescribed = undescribed.slice(UNDESCRIBED_SHOWN);

  const renderRow = (row: PlanRow) => {
    const { item, plan } = row;
    const when = whenPhrase(item, today);
    return (
      <View key={item.ref.id} style={styles.row} accessible accessibilityLabel={`${item.title}. ${when ?? ''}. ${PLAN_LABEL[plan.label]}. ${planReasonLine(plan)}`}>
        <Pressable
          onPress={() => onOpenItem(item.ref)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.title}`}
          style={({ pressed }) => [styles.titlePress, pressed ? { opacity: interaction.pressedOpacity } : null]}
        >
          <AppText variant="bodyStrong">{item.title}</AppText>
        </Pressable>
        {when ? (
          <AppText variant="supporting" color={color.text.secondary}>
            {when}
          </AppText>
        ) : null}
        <View style={styles.tagRow}>
          <Tag label={PLAN_LABEL[plan.label]} tone={PLAN_TONE[plan.label]} />
        </View>
        <AppText variant="supporting" color={color.text.secondary}>
          {planReasonLine(plan)}
        </AppText>
        {plan.openSteps.map((step) => (
          <Pressable
            key={step.ref.id}
            onPress={() => onOpenStep(step.ref.id)}
            accessibilityRole="button"
            accessibilityLabel={openStepLabel(step.title)}
            style={({ pressed }) => [styles.step, pressed ? { opacity: interaction.pressedOpacity } : null]}
          >
            <AppText variant="actionLabel" color={color.action.primary}>
              {openStepLabel(step.title)}
            </AppText>
          </Pressable>
        ))}
        {item.actions.includes('add_plan_step') && plan.openSteps.length === 0 ? (
          <Button label={PLAN_STEP_ACTION} variant="secondary" size="sm" onPress={() => onAddStep(item.ref)} accessibilityHint={`Adds a task toward ${item.title}`} />
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.section}>
      <Overline>{PLAN_SECTION_TITLE}</Overline>
      <AppText variant="supporting" color={color.text.secondary}>
        {PLAN_SECTION_INTRO}
      </AppText>
      <Card tone="subtle">
        <AppText variant="metadata" color={color.text.secondary}>
          {NOT_AUTHORIZATION}
        </AppText>
      </Card>
      {described.map(renderRow)}
      {shownUndescribed.map(renderRow)}
      {foldedUndescribed.length > 0 ? (
        <Disclosure
          collapsedLabel={`${foldedUndescribed.length} more with nobody recorded`}
          expandedLabel={`Hide the ${foldedUndescribed.length} more with nobody recorded`}
        >
          {foldedUndescribed.map(renderRow)}
        </Disclosure>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  row: { gap: spacing.xs, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border.subtle },
  tagRow: { flexDirection: 'row', marginTop: spacing.xs },
  step: { minHeight: sizing.minTouchTarget, justifyContent: 'center' },
  titlePress: { minHeight: sizing.minTouchTarget, justifyContent: 'center' },
});
