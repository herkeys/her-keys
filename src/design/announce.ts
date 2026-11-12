import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Spoken status changes on iOS.
 *
 * `accessibilityLiveRegion` is an Android-only prop in React Native: it has no iOS implementation, so every "polite" status line in
 * the app (an inline form error, "That did not go through", a restore result) was announced by TalkBack and silent under VoiceOver.
 * This hook closes that gap for iOS only, by posting the same sentence through the native announcement API when it CHANGES.
 * Android keeps using its live region exactly as before, so nothing is announced twice and Android behaviour is untouched.
 *
 * Presentation only: it reads nothing, stores nothing, and changes no state.
 */

/**
 * The sentence to speak when `next` replaces `previous`, or null for silence. Only a NEW, non-empty message is spoken: clearing a
 * message, re-rendering an unchanged one, and a message that was already on screen at mount are all silent.
 */
export function announcementToSpeak(previous: string | null | undefined, next: string | null | undefined): string | null {
  const spoken = (next ?? '').trim();
  if (spoken === '') return null;
  return spoken === (previous ?? '').trim() ? null : spoken;
}

export function useAnnounceOnIOS(message: string | null | undefined): void {
  const previous = useRef(message);
  useEffect(() => {
    const spoken = announcementToSpeak(previous.current, message);
    previous.current = message;
    if (spoken === null || Platform.OS !== 'ios') return;
    AccessibilityInfo.announceForAccessibility?.(spoken);
  }, [message]);
}
