import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onboardingOptions } from '../data/catalog/onboardingOptions';
import {
  ActionStateBlock,
  AiMark,
  AppText,
  BotanicalSprig,
  Button,
  Card,
  ChipToggle,
  ClarificationPrompt,
  ConfidenceBadge,
  CurvedWave,
  IconBadge,
  InlineNotice,
  InsightBlock,
  InterpretationReview,
  KeyBadge,
  Overline,
  PremiumBadge,
  RecommendationBlock,
  Screen,
  SegmentBar,
  Tag,
  TextField,
} from '../design/components';
import { brandPalette, color, radius, spacing, type as typeScale } from '../design/tokens';
import { ConsentErrorView, ConsentLegalView, ConsentPermissionsView } from '../features/consent/ConsentViews';
import { OnboardingScaffold } from '../features/onboarding/OnboardingScaffold';
import { PremiumEvidence } from './Ui02PremiumEvidence';
import { WelcomeAuthGalleryPreview, type SceneKey } from '../features/welcome/WelcomeAuthGalleryPreview';

/**
 * HK-FE-UI-02 source-rendered evidence screens (development only, reached through the existing internal design gallery:
 * `/gallery?mode=<mode>`). Every screen here renders the REAL component with fixed props — nothing is a mock-up image — so a
 * capture of it is a capture of the implementation. This is a design-review harness: it authenticates nothing, saves nothing,
 * and starts no purchase.
 *
 * Modes: tokens · components · ai · assets · welcome(&scene=&platform=) · consent(&stage=) · audit(&step=)
 */

export const EVIDENCE_MODES = ['tokens', 'components', 'ai', 'assets', 'welcome', 'consent', 'audit', 'premium'] as const;
export type EvidenceMode = (typeof EVIDENCE_MODES)[number];

export function isEvidenceMode(value: unknown): value is EvidenceMode {
  return typeof value === 'string' && (EVIDENCE_MODES as readonly string[]).includes(value);
}

interface Params {
  scene?: string;
  platform?: string;
  stage?: string;
  step?: string;
  state?: string;
}


export function Ui02Evidence({ mode, params }: { mode: EvidenceMode; params: Params }) {
  switch (mode) {
    case 'welcome':
      return (
        <View style={styles.full}>
          <WelcomeAuthGalleryPreview bare initialScene={(params.scene as SceneKey) ?? 'welcome'} initialPlatform={params.platform === 'android' ? 'android' : 'ios'} />
        </View>
      );
    case 'consent':
      return <ConsentEvidence stage={params.stage ?? 'legal'} />;
    case 'audit':
      return <AuditEvidence step={Number(params.step ?? 1)} />;
    case 'premium':
      return <PremiumEvidence state={params.state ?? 'home-active'} />;
    case 'tokens':
      return <TokenGuide />;
    case 'components':
      return <ComponentSheet />;
    case 'ai':
      return <AiSheet />;
    case 'assets':
      return <AssetSheet />;
  }
}

// ---------------------------------------------------------------------------

function ConsentEvidence({ stage }: { stage: string }) {
  const noop = () => {};
  // The real gate adds the system insets itself (ConsentFlow); the harness does the same so the capture is faithful.
  const insets = useSafeAreaInsets();
  const INSET = { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl };
  if (stage === 'permissions') return <ConsentPermissionsView inset={INSET} notificationsBusy={false} onEnableNotifications={noop} onContinue={noop} />;
  if (stage === 'error') return <ConsentErrorView inset={INSET} retried leaving={false} onRetry={noop} onLeave={noop} />;
  const filled = stage === 'legal-filled';
  return (
    <ConsentLegalView
      inset={INSET}
      terms={filled}
      privacy={filled}
      adult={filled}
      ai={filled ? true : null}
      saving={stage === 'legal-saving'}
      issue={stage === 'legal-issue' ? 'We could not securely save your selections. Check your connection and try again.' : null}
      onToggleTerms={noop}
      onTogglePrivacy={noop}
      onToggleAdult={noop}
      onChooseAi={noop}
      onCommit={noop}
    />
  );
}

const STEPS = [
  { title: 'What are you rebuilding toward?', description: "Pick a few. This isn't permanent — priorities can change.", group: 'goals' },
  { title: "What's already working?", description: "Her Keys won't try to fix what isn't broken.", group: 'strengths' },
  { title: 'Where does it tend to break down?', description: 'These are starting hypotheses, not permanent labels.', group: 'struggles' },
] as const;

function AuditEvidence({ step }: { step: number }) {
  const [picked, setPicked] = useState<string[]>([]);
  if (step === 4) {
    return (
      <OnboardingScaffold
        step={4}
        total={4}
        title="You don’t need to know what’s wrong."
        description="When something feels off but you can’t name it, you can just talk it out."
        onContinue={() => {}}
        continueLabel="See my profile"
      >
        <Card tone="accent">
          <Overline color={color.action.onSoft}>How it works</Overline>
          <AppText variant="title" style={styles.line}>
            Her Keys listens, offers a theory, then asks one question to check it.
          </AppText>
          <AppText variant="bodySm" color={color.text.secondary} style={styles.note}>
            No diagnosing yourself first. It’s available from anywhere in the app, any time.
          </AppText>
        </Card>
      </OnboardingScaffold>
    );
  }
  const spec = STEPS[Math.min(Math.max(step, 1), 3) - 1];
  return (
    <OnboardingScaffold
      step={Math.min(Math.max(step, 1), 3)}
      total={4}
      title={spec.title}
      description={spec.description}
      onContinue={() => {}}
      continueDisabled={picked.length === 0}
    >
      <View style={styles.chips}>
        {onboardingOptions[spec.group].map((option) => (
          <ChipToggle
            key={option.id}
            label={option.label}
            selected={picked.includes(option.id)}
            onPress={() => setPicked((cur) => (cur.includes(option.id) ? cur.filter((x) => x !== option.id) : [...cur, option.id]))}
          />
        ))}
      </View>
    </OnboardingScaffold>
  );
}

// ---------------------------------------------------------------------------

function Swatch({ name, value, note }: { name: string; value: string; note?: string }) {
  return (
    <View style={styles.swatchRow}>
      <View style={[styles.swatch, { backgroundColor: value }]} />
      <View style={styles.swatchText}>
        <AppText variant="supporting">{name}</AppText>
        <AppText variant="metadata" color={color.text.muted}>{value}{note ? ` · ${note}` : ''}</AppText>
      </View>
    </View>
  );
}

function TokenGuide() {
  return (
    <Screen bottomClearance={spacing.xxl}>
      <Overline>HK-FE-UI-02 · token guide</Overline>
      <AppText variant="display" style={styles.top}>Dusty Mauve + Luxury Black</AppText>
      <AppText variant="supporting" color={color.text.secondary} style={styles.top}>Airy Edition. Six brand colours; every other colour is a documented derivation.</AppText>
      <Section title="Brand — owner approved">
        <Swatch name="Berry Plum" value={brandPalette.berryPlum} note="actions" />
        <Swatch name="Dusty Mauve" value={brandPalette.dustyMauve} note="decoration only" />
        <Swatch name="Soft Lilac Gray" value={brandPalette.softLilac} note="surfaces" />
        <Swatch name="Warm Off-White" value={brandPalette.warmOffWhite} note="background" />
        <Swatch name="Deep Plum Gray" value={brandPalette.deepPlumGray} note="text" />
        <Swatch name="Luxury Black" value={brandPalette.luxuryBlack} note="premium detail" />
      </Section>
      <Section title="Derived">
        <Swatch name="surface.secondary (lilac wash)" value={color.surface.secondary} />
        <Swatch name="action.primaryPressed / onSoft" value={color.action.primaryPressed} note="5.54:1 on Lilac" />
        <Swatch name="action.primaryHighlight" value={color.action.primaryHighlight} note="button edge" />
        <Swatch name="text.secondary" value={color.text.secondary} />
        <Swatch name="text.muted" value={color.text.muted} />
        <Swatch name="border.control" value={color.border.control} note="3:1+" />
        <Swatch name="action.disabled" value={color.action.disabled} />
      </Section>
      <Section title="Functional — not brand">
        <Swatch name="risk" value={color.status.risk} />
        <Swatch name="success" value={color.status.success} />
        <Swatch name="attention" value={color.status.attention} />
        <Swatch name="waiting / pending" value={color.status.waiting} />
        <Swatch name="info" value={color.status.info} />
      </Section>
      <Section title="Typography">
        {(['display', 'screenTitle', 'sectionTitle', 'body', 'supporting', 'metadata', 'label'] as const).map((rung) => (
          <View key={rung} style={styles.typeRow}>
            <AppText variant={rung}>{rung === 'label' ? 'WHERE THINGS STAND' : 'Choose tomorrow’s dinner before noon'}</AppText>
            <AppText variant="metadata" color={color.text.muted}>{rung} · {typeScale[rung].fontSize}/{typeScale[rung].lineHeight} · {typeScale[rung].fontWeight}</AppText>
          </View>
        ))}
      </Section>
    </Screen>
  );
}

function ComponentSheet() {
  const [text, setText] = useState('');
  return (
    <Screen bottomClearance={spacing.xxl}>
      <Overline>HK-FE-UI-02 · shared component states</Overline>
      <Section title="Buttons">
        <Button label="Primary — Get Started" onPress={() => {}} />
        <Button label="Secondary — I Already Have an Account" variant="secondary" onPress={() => {}} />
        <Button label="Ghost — Maybe Later" variant="ghost" onPress={() => {}} />
        <Button label="Disabled — nothing selected yet" onPress={() => {}} disabled />
        <View style={styles.row}>
          <Button label="Small" size="sm" onPress={() => {}} />
          <Button label="Small secondary" size="sm" variant="secondary" onPress={() => {}} />
        </View>
      </Section>
      <Section title="Fields">
        <TextField label="Email" value={text} onChangeText={setText} placeholder="you@example.com" />
        <TextField label="Password" value="" onChangeText={() => {}} secureTextEntry error="Use at least 8 characters." />
        <TextField label="Timezone" value="America/New_York" onChangeText={() => {}} editable={false} />
      </Section>
      <Section title="Chips + tags + progress">
        <View style={styles.row}>
          <ChipToggle label="Selected" selected onPress={() => {}} />
          <ChipToggle label="Unselected" selected={false} onPress={() => {}} />
        </View>
        <View style={styles.row}>
          <Tag label="Her Keys Premium" tone="accent" />
          <Tag label="Needs a decision" tone="attention" />
          <Tag label="Settled" tone="success" />
          <Tag label="Waiting" tone="neutral" />
        </View>
        <SegmentBar filled={2} total={4} tone="accent" />
      </Section>
      <Section title="Status notices (icon + label + colour)">
        <InlineNotice tone="info" title="Information" body="Deep Plum Gray with an information icon." />
        <InlineNotice tone="success" title="Saved" body="Muted moss with a check." />
        <InlineNotice tone="attention" title="Needs a decision" body="Dark warm amber with a caution icon." />
        <InlineNotice tone="waiting" title="Waiting on the school" body="Neutral plum-gray with a clock." />
      </Section>
      <Section title="Cards">
        <Card><AppText variant="body">Surface — what Her Keys is telling you.</AppText></Card>
        <Card tone="subtle"><AppText variant="body">Subtle — supporting, settled content.</AppText></Card>
        <Card tone="accent"><Overline color={color.action.onSoft}>Accent</Overline><AppText variant="body">Soft Lilac — label uses the lilac-legal Berry.</AppText></Card>
        <Card tone="risk"><AppText variant="body" color={color.status.risk}>Risk — the clinic’s portal refused the new time.</AppText></Card>
      </Section>
    </Screen>
  );
}

function AiSheet() {
  return (
    <Screen bottomClearance={spacing.xxl}>
      <Overline>HK-FE-UI-02 · AI language: label + shape + icon</Overline>
      <Section title="Marks (dashed = unconfirmed reading)">
        <View style={styles.row}>
          {(['noticed', 'understood', 'asks', 'suggests', 'needsApproval', 'confirmed'] as const).map((kind) => (
            <View key={kind} style={styles.markCell}>
              <AiMark kind={kind} />
              <AppText variant="metadata" color={color.text.muted}>{kind}</AppText>
            </View>
          ))}
        </View>
      </Section>
      <Section title="Fact vs inference vs recommendation vs decision">
        <InsightBlock onDismiss={() => {}}>You haven’t had a quiet evening in nine days. Saturday looks different.</InsightBlock>
        <RecommendationBlock body="Move the library run to Saturday morning." approvalRequired={false} onApprove={() => {}} onShowAlternative={() => {}} onNotToday={() => {}} />
        <RecommendationBlock body="Shift the dentist call to Thursday’s open hour." approvalRequired onApprove={() => {}} onShowAlternative={() => {}} />
        <ClarificationPrompt question="Which day did you mean — this Friday or next?" proposed="The field trip payment is due this Friday." onConfirm={() => {}} onCorrect={() => {}} />
        <InterpretationReview fields={[{ label: 'Kind', value: 'Task' }, { label: 'Title', value: 'Call insurance' }, { label: 'When', value: 'Before Thursday' }]} onAccept={() => {}} onReject={() => {}} onCorrect={() => {}} />
      </Section>
      <Section title="Execution + outcome">
        <ActionStateBlock stage="proposed" summary="Move the dentist call to Thursday, 10:30–11:00." approvalQuestion="May Her Keys move it?" onApprove={() => {}} onDecline={() => {}} />
        <ActionStateBlock stage="approved" summary="Move the dentist call to Thursday, 10:30–11:00." />
        <ActionStateBlock stage="succeeded" outcome="verified" summary="The dentist call moved to Thursday, 10:30." />
        <ActionStateBlock stage="failed" summary="The clinic’s portal refused the new time." />
        <View style={styles.row}>
          <ConfidenceBadge level="possible" />
          <ConfidenceBadge level="likely" />
          <ConfidenceBadge level="established" />
        </View>
      </Section>
    </Screen>
  );
}

function AssetSheet() {
  return (
    <Screen bottomClearance={spacing.xxl}>
      <Overline>HK-FE-UI-02 · icon + botanical asset sheet</Overline>
      <Section title="Badges">
        <View style={styles.row}>
          <KeyBadge />
          <PremiumBadge size="md" />
          <PremiumBadge />
          <IconBadge icon="sunny-outline" />
          <IconBadge icon="mail-unread-outline" />
          <IconBadge icon="trending-up-outline" tone="berry" />
        </View>
      </Section>
      <Section title="Botanical sprig on off-white (faint, corner only)">
        <View style={styles.panel}><BotanicalSprig corner="topRight" size={150} /><AppText variant="body" style={styles.panelText}>Text never sits behind ornament.</AppText></View>
      </Section>
      <Section title="Curved wave">
        <View style={styles.panel}><CurvedWave edge="top" height={110} /></View>
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Overline style={styles.sectionLabel}>{title}</Overline>
      <View style={styles.stack}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: color.background },
  top: { marginTop: spacing.sm },
  line: { marginTop: spacing.md },
  note: { marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  section: { marginTop: spacing.xxl },
  sectionLabel: { marginBottom: spacing.md },
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  swatch: { width: 36, height: 36, borderRadius: radius.xs, borderWidth: StyleSheet.hairlineWidth, borderColor: color.border.default },
  swatchText: { flex: 1 },
  typeRow: { marginTop: spacing.xs },
  markCell: { alignItems: 'center', gap: spacing.xs, minWidth: 72 },
  panel: { height: 150, borderRadius: radius.lg, backgroundColor: color.background, borderWidth: StyleSheet.hairlineWidth, borderColor: color.border.default, overflow: 'hidden', justifyContent: 'flex-end', padding: spacing.lg },
  panelText: { color: color.text.secondary },
});
