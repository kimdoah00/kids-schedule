import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const WATCHED_PACKAGES = [
  'com.iscreammedia.app.hiclass.android',  // 하이클래스
  'com.kakao.talk',                         // 카카오톡
];

function getChannel(packageName: string): string {
  if (packageName.includes('hiclass')) return 'hiclass';
  if (packageName.includes('kakao')) return 'kakao';
  return 'unknown';
}

async function getApiConfig(): Promise<{ token: string; baseUrl: string } | null> {
  const token = await AsyncStorage.getItem('token');
  const baseUrl = __DEV__
    ? 'http://10.0.2.2:8000'
    : 'https://kids-schedule-production-ff25.up.railway.app';

  if (!token) return null;
  return { token, baseUrl };
}

async function sendToBackend(rawMessage: string, sourceApp: string, sourceChannel: string) {
  const config = await getApiConfig();
  if (!config) return;

  try {
    await fetch(`${config.baseUrl}/checkin/notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        raw_message: rawMessage,
        source_app: sourceApp,
        source_channel: sourceChannel,
      }),
    });
  } catch (e) {
    console.error('[NotificationService] Failed to send:', e);
  }
}

/**
 * Start listening for notifications from watched apps.
 *
 * This requires expo-android-notification-listener-service which provides
 * a native Android NotificationListenerService. The listener must be enabled
 * in Android Settings > Notifications > Notification access.
 *
 * On iOS, this is not supported. SMS is handled separately via expo-sms.
 */
export function startNotificationListener() {
  if (Platform.OS !== 'android') {
    console.log('[NotificationService] Only supported on Android');
    return;
  }

  try {
    // Dynamic import to avoid crash on iOS or when module not available
    const NotificationListener = require('expo-android-notification-listener-service');

    if (NotificationListener && NotificationListener.addNotificationListener) {
      NotificationListener.addNotificationListener((notification: {
        packageName: string;
        title?: string;
        text?: string;
        timestamp?: number;
      }) => {
        const pkg = notification.packageName;

        if (!WATCHED_PACKAGES.includes(pkg)) return;

        const channel = getChannel(pkg);
        const text = `${notification.title || ''} ${notification.text || ''}`.trim();

        if (!text) return;

        sendToBackend(text, pkg, channel);
      });

      console.log('[NotificationService] Listener started');
    }
  } catch (e) {
    console.log('[NotificationService] Module not available:', e);
  }
}

/**
 * Check if NotificationListenerService permission is granted.
 * Returns true if the service is enabled in system settings.
 */
export async function checkNotificationListenerPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    const NotificationListener = require('expo-android-notification-listener-service');
    if (NotificationListener && NotificationListener.isPermissionGranted) {
      return await NotificationListener.isPermissionGranted();
    }
  } catch (e) {
    console.log('[NotificationService] Cannot check permission:', e);
  }
  return false;
}

/**
 * Open system settings for NotificationListenerService permission.
 */
export async function requestNotificationListenerPermission() {
  if (Platform.OS !== 'android') return;

  try {
    const { Linking } = require('react-native');
    await Linking.openSettings();
  } catch (e) {
    console.log('[NotificationService] Cannot open settings:', e);
  }
}
