import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createThemedStyles } from '../src/design/theme';
import { TalkItOutView } from '../src/features/talk-it-out/TalkItOutView';

export default function TalkItOutModal() {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={styles.flex}>
        <TalkItOutView />
      </View>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
}));
