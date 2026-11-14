import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { iPadReadableColumn } from '../src/design/readableColumn';
import { createThemedStyles } from '../src/design/theme';
import { TalkItOutView } from '../src/features/talk-it-out/TalkItOutView';

export default function TalkItOutModal() {
  const styles = useStyles();
  // iPad only (IOS-FIX-002): the conversation keeps a readable width inside a wide iPad sheet.
  const column = iPadReadableColumn();
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
