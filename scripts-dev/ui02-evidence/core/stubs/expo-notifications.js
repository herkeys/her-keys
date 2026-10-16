// Evidence-only stand-in for expo-notifications (Expo Go 57.0.9 lacks the native ExpoTopicSubscriptionModule it requires).
// Local reminders are inert here; nothing is scheduled.
const granted = { status: 'undetermined', granted: false, canAskAgain: true, ios: { status: 0 } };
module.exports = {
  setNotificationHandler() {},
  setNotificationChannelAsync: async () => null,
  getPermissionsAsync: async () => granted,
  requestPermissionsAsync: async () => granted,
  getAllScheduledNotificationsAsync: async () => [],
  cancelScheduledNotificationAsync: async () => {},
  scheduleNotificationAsync: async () => 'evidence-noop',
  addNotificationResponseReceivedListener: () => ({ remove() {} }),
  getLastNotificationResponse: () => null,
  clearLastNotificationResponse() {},
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
};
