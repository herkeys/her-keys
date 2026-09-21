import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Button, ConfidenceBadge, Overline, WhyThis } from '../../design/components';
import { colors, interaction, radius, sizing, spacing, type as typeScale } from '../../design/tokens';
import { useTalkItOut } from '../../store/TalkItOutContext';
import type { TalkItOutMessage, TalkItOutStage } from '../../types';

export function TalkItOutView({ showHeader = false }: { showHeader?: boolean }) {
  const { messages, quickReplies, canRestart, sendMessage, selectQuickReply, restart } = useTalkItOut();
  const [draft, setDraft] = useState('');
  const [voiceNoteVisible, setVoiceNoteVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const frameRef = useRef<View>(null);
  const [screenTop, setScreenTop] = useState(0);

  function handleSend() {
    sendMessage(draft);
    setDraft('');
  }

  // KeyboardAvoidingView compares the keyboard's position on screen with its
  // own position inside its parent, so it has to be told how far down the
  // screen it starts — below the modal header, or below the status bar on the
  // tab. Without that the composer stays under the Android keyboard.
  function measureScreenTop() {
    frameRef.current?.measure((_x, _y, _width, _height, _pageX, pageY) => setScreenTop(pageY));
  }

  return (
    <View ref={frameRef} style={styles.container} onLayout={measureScreenTop}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : screenTop}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          // A reply can be taller than the viewport, so keep the newest turn in view.
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {showHeader && (
            <View style={styles.header}>
              <AppText variant="display">Talk it out</AppText>
            </View>
          )}

          {messages.map((message, index) => (
            <Bubble key={message.id} message={message} previous={messages[index - 1]} />
          ))}

          {quickReplies.length > 0 && (
            <View style={styles.quickReplies}>
              {quickReplies.map((option) => (
                <Button
                  key={option.id}
                  label={option.label}
                  variant="secondary"
                  size="sm"
                  onPress={() => selectQuickReply(option)}
                  style={styles.quickReply}
                />
              ))}
            </View>
          )}
        </ScrollView>

        <View style={styles.composerWrap}>
          {canRestart && (
            <View style={styles.restartRow}>
              <Button label="Start over" variant="ghost" size="sm" onPress={restart} />
            </View>
          )}

          <View style={styles.composer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voice input"
              accessibilityHint="Prototype only — Her Keys is not recording"
              onPress={() => setVoiceNoteVisible((v) => !v)}
              style={({ pressed }) => [styles.voiceButton, pressed ? styles.pressed : null]}
            >
              <AppText variant="metadata" color={colors.accent}>
                Voice
              </AppText>
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={quickReplies.length > 0 ? 'Or answer in your own words…' : "What's going on?"}
              placeholderTextColor={colors.textTertiary}
              style={[typeScale.body, styles.input]}
              multiline
              accessibilityLabel="Message to Her Keys"
            />
            <Button label="Send" size="sm" onPress={handleSend} disabled={!draft.trim()} />
          </View>

          <AppText variant="statusLabel" color={colors.textTertiary} style={styles.disclaimer}>
            {voiceNoteVisible
              ? 'Voice arrives in a later build — nothing is being recorded. Typing works for now.'
              : 'Prototype conversation — responses are scripted for this build.'}
          </AppText>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const stageLabels: Partial<Record<TalkItOutStage, string>> = {
  hypothesis: 'A theory',
  refinement: 'What that changes',
  clarify: 'One question',
  result: 'What I think is happening',
  'next-step': 'One move',
};

function Bubble({ message, previous }: { message: TalkItOutMessage; previous?: TalkItOutMessage }) {
  const isUser = message.speaker === 'user';
  // Tight spacing inside one turn, generous spacing between turns.
  const continuesTurn = previous?.speaker === message.speaker;

  // Rebuilt after a relaunch from the option she chose — shown as her answer, never as words she typed.
  if (message.recalled) {
    return (
      <View style={[styles.row, styles.rowUser, continuesTurn ? styles.rowTight : styles.rowSpaced]}>
        <View style={styles.recalled}>
          <Overline style={styles.stage}>{message.recalled === 'topic' ? 'Your topic' : 'Your answer'}</Overline>
          <AppText variant="body" color={colors.textSecondary}>
            {message.text}
          </AppText>
        </View>
      </View>
    );
  }

  const label = message.stage ? stageLabels[message.stage] : undefined;
  // clarify / next-step are the decisive interaction moments of the
  // conversation, so they carry the clay accent; a theory or a finding stays
  // quiet ink — the label text, not a color, says it is still an inference.
  const emphasized = message.stage === 'clarify' || message.stage === 'next-step';
  const labelColor = emphasized ? colors.accent : colors.textTertiary;

  return (
    <View style={[styles.row, isUser ? styles.rowUser : null, continuesTurn ? styles.rowTight : styles.rowSpaced]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleHerKeys]}>
        {label && (
          <Overline color={labelColor} style={styles.stage}>
            {label}
          </Overline>
        )}

        <AppText variant={emphasized ? 'sectionTitle' : 'body'} color={colors.textPrimary}>
          {message.text}
        </AppText>

        {message.confidence && (
          <View style={styles.confidence}>
            <ConfidenceBadge level={message.confidence} />
          </View>
        )}

        {message.evidence && message.evidence.length > 0 && <WhyThis reasons={message.evidence} style={styles.evidence} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xl },
  header: { marginBottom: spacing.xxl },
  row: { flexDirection: 'row' },
  rowUser: { justifyContent: 'flex-end' },
  rowSpaced: { marginTop: spacing.xl },
  rowTight: { marginTop: spacing.sm },
  bubble: { maxWidth: '88%', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, borderRadius: radius.md },
  bubbleHerKeys: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  bubbleUser: { backgroundColor: colors.accentSoft },
  recalled: { maxWidth: '88%', alignItems: 'flex-end', paddingHorizontal: spacing.lg },
  stage: { marginBottom: spacing.sm },
  confidence: { marginTop: spacing.md },
  evidence: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  quickReplies: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.lg, gap: spacing.sm },
  quickReply: { paddingHorizontal: spacing.lg },
  composerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  restartRow: { alignItems: 'flex-end', marginBottom: spacing.xs },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  voiceButton: {
    minHeight: sizing.minTouchTarget,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  pressed: { opacity: interaction.pressedOpacity },
  input: {
    flex: 1,
    minHeight: sizing.minTouchTarget,
    maxHeight: 110,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
  },
  disclaimer: { marginTop: spacing.sm },
});
