import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAdaptiveLayout } from '../../src/design/adaptive';
import { readableColumnFor } from '../../src/design/readableColumn';
import { createThemedStyles } from '../../src/design/theme';
import { TalkItOutView } from '../../src/features/talk-it-out/TalkItOutView';

export default function HerKeysAIScreen() {
  const styles = useStyles();
  // Wider than compact (iOS, Build 5): the conversation keeps a readable width instead of stretching bubbles across a 13-inch
  // display or an iPhone Duo inner display. The same `TalkItOutView` element stays mounted in every layout, so a resize, rotation
  // or fold never drops the conversation or the composer draft.
  const column = readableColumnFor(useAdaptiveLayout());
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={column ? [styles.flex, column] : styles.flex}>
        <TalkItOutView showHeader />
      </View>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
}));
