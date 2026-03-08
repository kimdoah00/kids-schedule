import { Linking, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';

/**
 * Copy text and open KakaoTalk for user to paste and send.
 */
export async function sendViaKakaoTalk(text: string): Promise<boolean> {
  await Clipboard.setStringAsync(text);

  if (Platform.OS === 'android') {
    try {
      await Linking.openURL('kakaotalk://');
      return true;
    } catch {
      // KakaoTalk not installed
      return false;
    }
  }
  return false;
}

/**
 * Copy text and open HiClass app for user to paste and send.
 */
export async function sendViaHiClass(text: string): Promise<boolean> {
  await Clipboard.setStringAsync(text);

  if (Platform.OS === 'android') {
    try {
      // Try to open HiClass via package name intent
      const hiclassUrl = 'intent://main#Intent;package=com.iscreammedia.app.hiclass.android;end';
      const canOpen = await Linking.canOpenURL(hiclassUrl);
      if (canOpen) {
        await Linking.openURL(hiclassUrl);
        return true;
      }
      // Fallback: try market link
      await Linking.openURL('market://details?id=com.iscreammedia.app.hiclass.android');
      return false;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Get the appropriate send function for a channel.
 */
export function getSendFunction(channel: string): ((text: string) => Promise<boolean>) | null {
  switch (channel) {
    case 'kakao':
      return sendViaKakaoTalk;
    case 'hiclass':
      return sendViaHiClass;
    default:
      return null;
  }
}
