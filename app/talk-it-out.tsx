import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAdaptiveLayout } from '../src/design/adaptive';
import { readableColumnFor } from '../src/design/readableColumn';
import { createThemedStyles } from '../src/design/theme';
import { TalkItOutView } from '../src/features/talk-it-out/TalkItOutView';

export default function TalkItOutModal() {
  const styles = useStyles();
  // Wider than compact (iOS, Build 5): the conversation keeps a readable width inside a wide sheet. The view stays mounted
  // across layout changes, so the conversation and draft survive them.
  const column = readableColumnFor(useAdaptiveLayout());
  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={column ? [styles.flex, column] : styles.flex}>
        <TalkItOutView />
      </View>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
}));
