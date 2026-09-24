import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { LocalReminderPlan } from '../notifications/localReminderPlan';
import {
  HER_KEYS_REMINDER_OWNER,
  isHerKeysReminderData,
  reminderDataMatchesPlan,
  routeFromHerKeysReminderData,
} from '../notifications/localNotificationOwnership';

export type LocalNotificationPermission = 'undetermined' | 'granted' | 'denied';

export const HER_KEYS_REMINDER_CHANNEL = 'herkeys-reminders';

/**
 * Foreground delivery stays quiet: the reminder remains in the notification
 * list but does not throw a banner over Her Keys while she is already using it.
 */
export function configureLocalNotificationPresentation(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Android 8+ routes every scheduled reminder through one quiet channel. On
 * Android 13 the channel must exist before the OS can offer notification
 * permission; creating it does not itself ask the user.
 */
export async function ensureLocalReminderChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(HER_KEYS_REMINDER_CHANNEL, {
    name: 'Her Keys reminders',
    description: 'Quiet reminders you chose inside Her Keys.',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    enableVibrate: false,
    showBadge: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

export function permissionKind(
  settings: Notifications.NotificationPermissionsStatus
): LocalNotificationPermission {
  const iosStatus = settings.ios?.status;
  if (
    settings.granted ||
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  ) {
    return 'granted';
  }
  if (settings.status === 'denied' || iosStatus === Notifications.IosAuthorizationStatus.DENIED) return 'denied';
  return 'undetermined';
}

export async function readLocalNotificationPermission(): Promise<LocalNotificationPermission> {
  return permissionKind(await Notifications.getPermissionsAsync());
}

/** Call only from a user action. Nothing at launch invokes this. */
export async function requestLocalNotificationPermission(): Promise<LocalNotificationPermission> {
  await ensureLocalReminderChannel();
  const settings = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: false,
    },
    android: {},
  });
  return permissionKind(settings);
}

export async function cancelHerKeysLocalReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ours = scheduled.filter((request) => isHerKeysReminderData(request.content.data));
  await Promise.all(ours.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
}

/**
 * Reconcile to at most one Her Keys-owned reminder. We never call the global
 * cancel-all API because another current or future capability may own its own
 * device notification.
 */
export async function reconcileHerKeysLocalReminder(
  enabled: boolean,
  permission: LocalNotificationPermission,
  plan: LocalReminderPlan | null
): Promise<void> {
  await ensureLocalReminderChannel();

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ours = scheduled.filter((request) => isHerKeysReminderData(request.content.data));

  if (!enabled || permission !== 'granted' || plan === null) {
    await Promise.all(ours.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
    return;
  }

  const matches = ours.filter((request) => reminderDataMatchesPlan(request.content.data, plan));
  if (matches.length === 1 && ours.length === 1) return;

  await Promise.all(ours.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));

  await Notifications.scheduleNotificationAsync({
    content: {
      title: plan.title,
      body: plan.body,
      sound: false,
      data: {
        owner: HER_KEYS_REMINDER_OWNER,
        kind: plan.kind,
        url: plan.url,
        planKey: plan.planKey,
        triggerAtMs: plan.triggerAtMs,
        targetDate: plan.targetDate,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(plan.triggerAtMs),
      ...(Platform.OS === 'android' ? { channelId: HER_KEYS_REMINDER_CHANNEL } : {}),
    },
  });
}

export function addHerKeysReminderResponseListener(listener: (route: '/today') => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const route = routeFromHerKeysReminderData(response.notification.request.content.data);
    if (route) listener(route);
  });
  return () => subscription.remove();
}

/** A cold start may already carry the tap that launched the app. */
export function readInitialHerKeysReminderRoute(): '/today' | null {
  try {
    const response = Notifications.getLastNotificationResponse();
    const route = routeFromHerKeysReminderData(response?.notification.request.content.data);
    if (route) Notifications.clearLastNotificationResponse();
    return route;
  } catch {
    return null;
  }
}
