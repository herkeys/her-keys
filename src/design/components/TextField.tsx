import { useState, type ComponentProps } from 'react';
import { StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { radius, sizing, spacing } from '../tokens';
import { createThemedStyles, useTheme } from '../theme';
import { useAnnounceOnIOS } from '../announce';
import { AppText, Overline } from './AppText';

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string | null;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  /** Keep password fields visually concealed; password values are never logged or persisted. */
  secureTextEntry?: boolean;
  autoFocus?: boolean;
  /** The most characters the stored field accepts, so typing can't run past what can be saved. */
  maxLength?: number;
  /** Renders a non-editable field without dimming it into illegibility. */
  editable?: boolean;
  /** Passthroughs for specialized fields (email, one-time codes). Defaults unchanged. */
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  autoComplete?: ComponentProps<typeof TextInput>['autoComplete'];
  textContentType?: ComponentProps<typeof TextInput>['textContentType'];
  returnKeyType?: ComponentProps<typeof TextInput>['returnKeyType'];
  onSubmitEditing?: () => void;
  /**
   * How the error text is announced when it appears. Defaults to 'polite': a validation message nobody hears is a dead end for a
   * screen-reader user. (Android live region; iOS is spoken through `useAnnounceOnIOS` below, which has no such prop.)
   */
  errorAccessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
}

/**
 * The one text-entry primitive: labeled, keyboard-safe, with an explicit
 * focus state and an error state that is text, never color alone.
 */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType,
  multiline,
  secureTextEntry,
  autoFocus,
  maxLength,
  editable = true,
  autoCapitalize,
  autoCorrect,
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
  errorAccessibilityLiveRegion,
}: TextFieldProps) {
  const { color } = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  // iOS has no live region: speak a NEW error through the native announcement API (silent on Android, which uses the live region).
  useAnnounceOnIOS(error);

  return (
    <View style={styles.wrap}>
      <Overline style={styles.label}>{label}</Overline>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.text.muted}
        keyboardType={keyboardType}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        autoFocus={autoFocus}
        maxLength={maxLength}
        editable={editable}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        autoComplete={autoComplete}
        textContentType={textContentType}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel={label}
        accessibilityState={{ disabled: !editable }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          multiline ? styles.multiline : null,
          focused ? styles.inputFocused : null,
          error ? styles.inputError : null,
        ]}
      />
      {error && (
        <AppText
          variant="metadata"
          color={color.status.attention}
          style={styles.error}
          accessibilityLiveRegion={errorAccessibilityLiveRegion ?? 'polite'}
        >
          {error}
        </AppText>
      )}
    </View>
  );
}

const useStyles = createThemedStyles(({ color }) => StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.sm },
  input: {
    minHeight: sizing.control.height,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.control,
    backgroundColor: color.surface.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: color.text.primary,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  // Focus is a 2px Berry edge (5.10:1 on off-white); padding gives back the extra pixel so the text never shifts.
  inputFocused: {
    borderColor: color.action.primary,
    borderWidth: 2,
    paddingHorizontal: spacing.lg - 1,
    paddingVertical: spacing.md - 1,
  },
  inputError: { borderColor: color.status.attention },
  error: { marginTop: spacing.xs },
}));
