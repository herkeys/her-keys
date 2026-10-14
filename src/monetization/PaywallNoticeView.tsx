import type { ViewStyle } from 'react-native';
import { InlineNotice } from '../design/components';
import type { PaywallNotice } from './paywallFeedback';

/** The one way a paywall outcome is shown, so every Premium surface says it in the same words and the same tone. */
export function PaywallNoticeView({ notice, style }: { notice: PaywallNotice | null; style?: ViewStyle }) {
  if (notice === null) return null;
  return <InlineNotice tone={notice.tone} title={notice.message} style={style} />;
}
