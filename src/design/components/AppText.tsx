import { Text, type TextProps } from 'react-native';
import { typography } from '../tokens';
import { useTheme } from '../theme';

type Variant = keyof typeof typography;

interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
}

export function AppText({ variant = 'body', color, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  return <Text style={[{ color: color ?? colors.textPrimary }, typography[variant], style]} {...rest} />;
}

/** Uppercase eyebrow label. Takes plain text and handles the casing itself. */
export function Overline({ children, color, style }: { children: string; color?: string; style?: TextProps['style'] }) {
  const { colors } = useTheme();
  return (
    <Text style={[{ color: color ?? colors.textTertiary }, typography.overline, style]}>{children.toUpperCase()}</Text>
  );
}
