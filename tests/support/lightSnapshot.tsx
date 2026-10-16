/**
 * HK-FE-UI-02-DM — deterministic LIGHT-mode regression snapshots.
 *
 * Renders a broad set of the REAL components and screens (shared primitives, every AI register, the badges and decoration, every
 * Welcome/auth scene, the onboarding scaffold, the consent stage views) and serialises each rendered tree — element type, FULLY
 * RESOLVED styles, accessibility props, text — to plain JSON. The baseline fixture (tests/design-system/fixtures/light-baseline.json)
 * was produced by running this very file against the PRE-migration source (ca9e792, where every component read static tokens); the
 * test then requires the migrated source, rendered under the Light theme, to produce identical JSON. A single changed colour, radius,
 * weight, margin or label anywhere in these trees fails with the name of the render and the path of the difference.
 *
 * This file must stay free of any import of the theme module so it runs unchanged against the baseline tree.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import {
  ActionStateBlock, AiMark, BotanicalSprig, Button, Card, ChipToggle, ClarificationPrompt, ConfidenceBadge, CurvedWave, Divider,
  EmptyState, ErrorState, IconBadge, InlineNotice, InsightBlock, InterpretationReview, KeyBadge, LoadingState, OfflineState, Overline,
  PremiumBadge, ProvenanceLabel, RecommendationBlock, SegmentBar, StatusList, Tag, TextField, WhyThis,
} from '../../src/design/components/index.ts';
import { WelcomeAuthShell } from '../../src/features/welcome/WelcomeAuthShell.tsx';
import { OnboardingScaffold } from '../../src/features/onboarding/OnboardingScaffold.tsx';
import { ConsentErrorView, ConsentLegalView, ConsentPermissionsView } from '../../src/features/consent/ConsentViews.tsx';
import { render } from './render.tsx';

const noop = () => {};

/** Plain-JSON serialisation of a rendered tree. Functions are dropped; style functions are resolved for the unpressed state. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serialise(node: any): any {
  if (node === null || node === undefined) return null;
  if (typeof node === 'string') return node;
  const props: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const [key, value] of Object.entries(node.props ?? {})) {
    if (key === 'children' || typeof value === 'function' || value === undefined) continue;
    if (key === 'style') {
      const resolved = typeof value === 'function' ? value({ pressed: false }) : value;
      props.style = StyleSheet.flatten(resolved) ?? {};
      continue;
    }
    props[key] = value;
  }
  const out: any = { type: node.type, props }; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (node.children && node.children.length) out.children = node.children.map(serialise);
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shell = (state: any) => (
  <WelcomeAuthShell
    state={{ step: 'welcome', presentation: 'normal', platform: 'ios', pending: null, email: '', emailError: null, otpError: null, resendSecondsLeft: null, ...state }}
    onBegin={noop} onExistingAccount={noop} onSelectPremium={noop} onContinueFree={noop} onApple={noop} onGoogle={noop} onChooseEmail={noop}
    onChoosePassword={noop} onPasswordModeChange={noop} onSubmitPassword={noop} onForgotPassword={noop}
    onRequestRecovery={async () => 'ok'} onVerifyRecovery={async () => 'ok'} onUpdateRecoveryPassword={async () => 'ok'} onCancelRecovery={noop}
    onSubmitEmail={noop} onSubmitOtp={noop} onResendOtp={noop} onChangeEmail={noop} onBack={noop} onSignOut={noop}
  />
);

const inset = { paddingTop: 24, paddingBottom: 24 };

export const CASES = {
  // ---- shared primitives
  'button/primary': () => <Button label="Get Started" onPress={noop} />,
  'button/secondary': () => <Button label="I Already Have an Account" variant="secondary" onPress={noop} />,
  'button/ghost': () => <Button label="Maybe Later" variant="ghost" onPress={noop} />,
  'button/disabled': () => <Button label="Continue" onPress={noop} disabled />,
  'button/small': () => <Button label="Undo" size="sm" variant="secondary" onPress={noop} />,
  'card/surface': () => <Card><Overline>Card</Overline></Card>,
  'card/subtle': () => <Card tone="subtle"><Overline>Card</Overline></Card>,
  'card/accent-raised': () => <Card tone="accent" raised><Overline>Card</Overline></Card>,
  'card/attention': () => <Card tone="attention"><Overline>Card</Overline></Card>,
  'card/success': () => <Card tone="success"><Overline>Card</Overline></Card>,
  'card/risk': () => <Card tone="risk"><Overline>Card</Overline></Card>,
  'tag/neutral': () => <Tag label="Waiting" />,
  'tag/attention': () => <Tag label="Needs a decision" tone="attention" />,
  'tag/success': () => <Tag label="Settled" tone="success" />,
  'tag/accent': () => <Tag label="Her Keys Premium" tone="accent" />,
  'chip/selected': () => <ChipToggle label="Cooking" selected onPress={noop} />,
  'chip/unselected': () => <ChipToggle label="Cooking" selected={false} onPress={noop} />,
  'segmentbar/accent': () => <SegmentBar filled={2} total={4} tone="accent" />,
  'segmentbar/attention': () => <SegmentBar filled={3} total={4} tone="attention" />,
  'segmentbar/neutral': () => <SegmentBar filled={1} total={4} tone="neutral" />,
  'statuslist': () => <StatusList items={[{ key: 'k', label: 'Kids', value: '1 scheduled', onPress: noop }, { key: 'm', label: 'Money', value: '1 due today', needsAttention: true, onPress: noop }]} />,
  'textfield/plain': () => <TextField label="Email" value="" onChangeText={noop} placeholder="you@example.com" />,
  'textfield/error': () => <TextField label="Password" value="" onChangeText={noop} secureTextEntry error="Use at least 8 characters." />,
  'textfield/readonly': () => <TextField label="Timezone" value="America/New_York" onChangeText={noop} editable={false} />,
  'divider': () => <Divider />,
  'notice/info': () => <InlineNotice tone="info" title="Information" body="Details." />,
  'notice/attention': () => <InlineNotice tone="attention" title="Needs a decision" />,
  'notice/success': () => <InlineNotice tone="success" title="Saved" />,
  'notice/waiting': () => <InlineNotice tone="waiting" title="Waiting" />,
  'state/loading': () => <LoadingState label="Syncing" />,
  'state/empty': () => <EmptyState title="Nothing yet" body="Say it in a sentence." actionLabel="Capture" onAction={noop} />,
  'state/error': () => <ErrorState body="That didn't save." onRetry={noop} />,
  'state/offline': () => <OfflineState />,
  // ---- AI language
  'ai/insight': () => <InsightBlock onDismiss={noop}>You haven’t had a quiet evening in nine days.</InsightBlock>,
  'ai/recommendation': () => <RecommendationBlock body="Move it to Saturday." approvalRequired={false} onApprove={noop} onShowAlternative={noop} onNotToday={noop} />,
  'ai/recommendation-approval': () => <RecommendationBlock body="Shift the call." approvalRequired onApprove={noop} />,
  'ai/why': () => <WhyThis reasons={['Thursday has a 65-minute window.', 'Today’s only gap is 35 minutes.']} />,
  'ai/clarify': () => <ClarificationPrompt question="Which day?" proposed="Due Friday." onConfirm={noop} onCorrect={noop} />,
  'ai/review': () => <InterpretationReview fields={[{ label: 'Kind', value: 'Task' }, { label: 'When', value: 'Before Thursday' }]} onAccept={noop} onReject={noop} onCorrect={noop} />,
  'ai/confidence-possible': () => <ConfidenceBadge level="possible" />,
  'ai/confidence-established': () => <ConfidenceBadge level="established" />,
  'ai/provenance': () => <ProvenanceLabel source="ai-inference" />,
  'ai/action-proposed': () => <ActionStateBlock stage="proposed" summary="Move the dentist call." approvalQuestion="May Her Keys move it?" onApprove={noop} onDecline={noop} />,
  'ai/action-approved': () => <ActionStateBlock stage="approved" summary="Move the dentist call." />,
  'ai/action-succeeded': () => <ActionStateBlock stage="succeeded" outcome="verified" summary="Moved." />,
  'ai/action-failed': () => <ActionStateBlock stage="failed" summary="The portal refused." />,
  'ai/marks': () => <>{(['noticed', 'understood', 'asks', 'suggests', 'needsApproval', 'confirmed'] as const).map((kind) => <AiMark key={kind} kind={kind} />)}</>,
  // ---- brand details
  'badge/key': () => <KeyBadge />,
  'badge/premium': () => <PremiumBadge size="md" />,
  'badge/icon': () => <IconBadge icon="sunny-outline" />,
  'badge/icon-berry': () => <IconBadge icon="trending-up-outline" tone="berry" />,
  'decoration/sprig': () => <BotanicalSprig />,
  'decoration/wave': () => <CurvedWave />,
  // ---- Welcome tree
  'welcome/welcome': () => shell({ step: 'welcome' }),
  'welcome/premium': () => shell({ step: 'premium', passwordMode: 'signUp' }),
  'welcome/choice-ios': () => shell({ step: 'account-choice' }),
  'welcome/choice-android': () => shell({ step: 'account-choice', platform: 'android' }),
  'welcome/choice-pending': () => shell({ step: 'account-choice', pending: 'google' }),
  'welcome/signup': () => shell({ step: 'password', passwordMode: 'signUp' }),
  'welcome/signin': () => shell({ step: 'password', passwordMode: 'signIn' }),
  'welcome/signin-rejected': () => shell({ step: 'password', passwordMode: 'signIn', passwordNotice: 'rejected' }),
  'welcome/signup-confirm': () => shell({ step: 'password', passwordMode: 'signUp', passwordNotice: 'confirmationRequired' }),
  'welcome/recovery': () => shell({ step: 'recovery', recoveryEmail: 'rowan@example.com' }),
  'welcome/email': () => shell({ step: 'email' }),
  'welcome/otp': () => shell({ step: 'otp', email: 'rowan@example.com' }),
  'welcome/otp-wrong': () => shell({ step: 'otp', email: 'rowan@example.com', otpError: 'wrong-code' }),
  'welcome/settling': () => shell({ presentation: 'settling' }),
  'welcome/degraded': () => shell({ presentation: 'auth-degraded', step: 'account-choice' }),
  'welcome/conflict': () => shell({ presentation: 'account-conflict' }),
  // ---- onboarding + consent
  'onboarding/scaffold': () => (
    <OnboardingScaffold step={2} total={4} title="What's already working?" description="Her Keys won't try to fix what isn't broken." onContinue={noop}>
      <ChipToggle label="Cooking" selected onPress={noop} />
    </OnboardingScaffold>
  ),
  'consent/legal': () => <ConsentLegalView inset={inset} terms privacy adult={false} ai={null} saving={false} issue={null} onToggleTerms={noop} onTogglePrivacy={noop} onToggleAdult={noop} onChooseAi={noop} onCommit={noop} />,
  'consent/legal-issue': () => <ConsentLegalView inset={inset} terms privacy adult ai saving={false} issue="We could not securely save your selections." onToggleTerms={noop} onTogglePrivacy={noop} onToggleAdult={noop} onChooseAi={noop} onCommit={noop} />,
  'consent/permissions': () => <ConsentPermissionsView inset={inset} notificationsBusy={false} onEnableNotifications={noop} onContinue={noop} />,
  'consent/error': () => <ConsentErrorView inset={inset} retried leaving={false} onRetry={noop} onLeave={noop} />,
};

/**
 * Renders every case; `wrap` lets the caller put the element under a provider (the migrated tree under the Light theme) while the
 * baseline tree (no provider concept) renders bare.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function renderAllSnapshots(wrap: (element: React.ReactElement) => React.ReactElement = (element) => element): Promise<Record<string, any>> {
  const out: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const [name, make] of Object.entries(CASES)) {
    const renderer = await render(wrap(make()));
    out[name] = JSON.parse(JSON.stringify(serialiseTree(renderer.toJSON())));
    renderer.unmount();
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialiseTree(json: any): any {
  if (Array.isArray(json)) return json.map(serialise);
  return serialise(json);
}
