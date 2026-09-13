import { Text, type TextProps } from 'react-native';
import { colors, typography } from '../tokens';

type Variant = keyof typeof typography;

interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
}

export function AppText({ variant = 'body', color, style, ...rest }: AppTextProps) {
  return <Text style={[{ color: color ?? colors.textPrimary }, typography[variant], style]} {...rest} />;
}

/** Uppercase eyebrow label. Takes plain text and handles the casing itself. */
export function Overline({ children, color, style }: { children: string; color?: string; style?: TextProps['style'] }) {
  return (
    <Text style={[{ color: color ?? colors.textTertiary }, typography.overline, style]}>{children.toUpperCase()}</Text>
  );
}
