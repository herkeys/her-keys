import { StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { colors, radius, spacing } from '../tokens';
import { AppText, Overline } from './AppText';

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string | null;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  autoFocus?: boolean;
}

/** The one text-entry primitive Build 3's forms need — a labeled, accessible input, plain and keyboard-safe. */
export function TextField({ label, value, onChangeText, placeholder, error, keyboardType, multiline, autoFocus }: TextFieldProps) {
  return (
    <View style={styles.wrap}>
      <Overline style={styles.label}>{label}</Overline>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType}
        multiline={multiline}
        autoFocus={autoFocus}
        accessibilityLabel={label}
        style={[styles.input, multiline ? styles.multiline : null, error ? styles.inputError : null]}
      />
      {error && (
        <AppText variant="caption" color={colors.attention} style={styles.error}>
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.sm },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  inputError: { borderColor: colors.attention },
  error: { marginTop: spacing.xs },
});
