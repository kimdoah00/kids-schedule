import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ScrollView, SafeAreaView, ActivityIndicator, Image, Platform,
  Linking, PermissionsAndroid,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { onboardingAPI } from '../../src/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SmsScan() {
  const router = useRouter();
  const [pastedMessages, setPastedMessages] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [smsGranted, setSmsGranted] = useState(false);
  const [step, setStep] = useState<'permission' | 'scan'>('permission');

  const requestSmsPermission = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        {
          title: 'SMS 읽기 권한',
          message: '입퇴실 문자를 분석하려면 SMS 읽기 권한이 필요합니다.',
          buttonPositive: '허용',
          buttonNegative: '거부',
        }
      );
      setSmsGranted(result === PermissionsAndroid.RESULTS.GRANTED);
      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('SMS 권한 허용됨', 'SMS 문자를 읽을 수 있습니다.');
      }
    } catch (e) {
      console.log('SMS permission error:', e);
    }
  };

  const openNotificationListenerSettings = async () => {
    if (Platform.OS !== 'android') return;
    try {
      await Linking.sendIntent('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS');
    } catch (e) {
      // Fallback: open app notification settings
      try {
        await Linking.openSettings();
      } catch (e2) {
        Alert.alert('설정을 열 수 없습니다', '설정 > 알림 > 알림 접근에서 키즈스케줄을 허용해주세요.');
      }
    }
  };

  const addScreenshot = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      base64: true,
      quality: 0.7,
      allowsMultipleSelection: true,
    });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      setScreenshots((prev) => [...prev, ...uris]);
    }
  };

  const analyzeMessages = async () => {
    if (!pastedMessages.trim() && screenshots.length === 0) {
      Alert.alert('메시지를 붙여넣거나 스크린샷을 추가해주세요');
      return;
    }

    setLoading(true);
    try {
      // Parse pasted messages - detect channel from content
      const lines = pastedMessages.split('\n').filter((l) => l.trim());
      const smsMessages: any[] = [];
      const notifications: any[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        // Detect channel markers like [카톡], [하이클래스], [SMS]
        if (trimmed.startsWith('[카톡]') || trimmed.startsWith('[KAKAO]')) {
          notifications.push({
            body: trimmed.replace(/^\[(카톡|KAKAO)\]\s*/, ''),
            timestamp: new Date().toISOString(),
            source_app: 'com.kakao.talk',
            source_channel: 'kakao',
          });
        } else if (trimmed.startsWith('[하이클래스]') || trimmed.startsWith('[HICLASS]')) {
          notifications.push({
            body: trimmed.replace(/^\[(하이클래스|HICLASS)\]\s*/, ''),
            timestamp: new Date().toISOString(),
            source_app: 'com.iscreammedia.app.hiclass.android',
            source_channel: 'hiclass',
          });
        } else {
          smsMessages.push({
            phone_number: 'unknown',
            body: trimmed,
            timestamp: new Date().toISOString(),
            sender_name: null,
          });
        }
      }

      // Use multi-channel if we have notifications, otherwise fallback to SMS-only
      let res;
      if (notifications.length > 0) {
        res = await onboardingAPI.analyzeAll(smsMessages, notifications);
      } else {
        res = await onboardingAPI.analyzeSms(smsMessages);
      }

      // Store results for next screens
      await AsyncStorage.setItem('onboarding_contacts', JSON.stringify(res.contacts || []));
      await AsyncStorage.setItem('onboarding_schedules', JSON.stringify(res.schedules || []));

      const contactCount = res.contacts?.length || 0;
      const scheduleCount = res.schedules?.length || 0;
      const channelInfo = res.channels_scanned
        ? ` (${res.channels_scanned.join(', ')})`
        : '';

      Alert.alert(
        'AI 분석 완료',
        `연락처 ${contactCount}개, 스케줄 패턴 ${scheduleCount}개를 찾았습니다.${channelInfo}\n다음 화면에서 확인하세요.`,
        [{ text: '확인', onPress: () => router.push('/(auth)/contact-confirm') }]
      );
    } catch (e: any) {
      Alert.alert('분석 실패', e.response?.data?.detail || '다시 시도해주세요');
    } finally {
      setLoading(false);
    }
  };

  const skip = () => {
    router.push('/(auth)/contact-add');
  };

  // Step 1: Permission screen (Android only)
  if (step === 'permission' && Platform.OS === 'android') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.permissionContent}>
          <Text style={styles.heading}>알림 접근 권한 설정</Text>
          <Text style={styles.desc}>
            하이클래스, 카카오톡 알림을 자동으로 읽으려면{'\n'}
            알림 접근 권한이 필요합니다
          </Text>

          <View style={styles.channelList}>
            <TouchableOpacity style={styles.channelItem} onPress={requestSmsPermission}>
              <Text style={styles.channelIcon}>📱</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.channelName}>SMS 문자</Text>
                <Text style={styles.channelDesc}>입퇴실, 도착 알림 문자</Text>
              </View>
              <Text style={styles.channelAction}>설정 →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.channelItem} onPress={openNotificationListenerSettings}>
              <Text style={styles.channelIcon}>💬</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.channelName}>카카오톡</Text>
                <Text style={styles.channelDesc}>학원/선생님 카톡 알림</Text>
              </View>
              <Text style={styles.channelAction}>설정 →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.channelItem} onPress={openNotificationListenerSettings}>
              <Text style={styles.channelIcon}>🏫</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.channelName}>하이클래스</Text>
                <Text style={styles.channelDesc}>학교 알림장, 공지사항</Text>
              </View>
              <Text style={styles.channelAction}>설정 →</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.analyzeBtn} onPress={() => setStep('scan')}>
            <Text style={styles.analyzeBtnText}>다음 단계로 →</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipPermBtn} onPress={() => setStep('scan')}>
            <Text style={styles.skipBtnText}>나중에 설정하고 수동 입력으로 →</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Step 2: Scan screen
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <Text style={styles.heading}>메시지 이력 분석</Text>
        <Text style={styles.desc}>
          엄마 폰에 매일 오는 입퇴실/도착 문자를 AI가 분석해서{'\n'}
          연락처와 스케줄을 자동으로 찾아드립니다
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>3채널 통합 분석 지원</Text>
          <Text style={styles.infoText}>
            - SMS 문자: "지윤이가 출석했습니다"{'\n'}
            - [카톡] 학원 선생님: "오늘 수업 정상 진행"{'\n'}
            - [하이클래스] 돌봄교실: "입실 완료"{'\n'}
            {'\n'}
            채널 표시 없으면 SMS로 자동 분류됩니다
          </Text>
        </View>

        <Text style={styles.sectionTitle}>방법 1: 메시지 붙여넣기</Text>
        <Text style={styles.hint}>문자/카톡/하이클래스 메시지를 복사해서 붙여넣으세요</Text>
        <TextInput
          style={styles.textArea}
          value={pastedMessages}
          onChangeText={setPastedMessages}
          placeholder={"[2026-03-06 09:00] 한빛초: 지윤이가 출석했습니다\n[카톡] 태권도 관장님: 지윤이 도착했습니다\n[하이클래스] 돌봄교실: 지윤이 입실 완료"}
          multiline
          numberOfLines={8}
          textAlignVertical="top"
        />

        <Text style={styles.sectionTitle}>방법 2: 채팅 스크린샷</Text>
        <Text style={styles.hint}>카톡/문자 대화 스크린샷을 추가하세요</Text>
        <View style={styles.screenshotRow}>
          {screenshots.map((uri, i) => (
            <Image key={i} source={{ uri }} style={styles.screenshot} />
          ))}
          <TouchableOpacity style={styles.addScreenshotBtn} onPress={addScreenshot}>
            <Text style={styles.addScreenshotText}>+ 추가</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingSection}>
            <ActivityIndicator size="large" color="#6c5ce7" />
            <Text style={styles.loadingText}>AI가 3채널 메시지를 분석 중...</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.analyzeBtn} onPress={analyzeMessages}>
            <Text style={styles.analyzeBtnText}>AI 분석 시작</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.skipBtn} onPress={skip}>
        <Text style={styles.skipBtnText}>건너뛰고 직접 입력 →</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  permissionContent: { flex: 1, justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: 'bold' },
  desc: { fontSize: 13, color: '#888', marginTop: 4, marginBottom: 16, lineHeight: 20 },
  channelList: { marginVertical: 20, gap: 12 },
  channelItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#f8f7ff', borderRadius: 12, padding: 14,
  },
  channelIcon: { fontSize: 28 },
  channelName: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  channelDesc: { fontSize: 12, color: '#888', marginTop: 2 },
  channelAction: { fontSize: 13, color: '#6c5ce7', fontWeight: '600' },
  infoBox: {
    backgroundColor: '#f8f7ff', borderRadius: 12, padding: 16, marginBottom: 20,
    borderLeftWidth: 3, borderLeftColor: '#6c5ce7',
  },
  infoTitle: { fontSize: 14, fontWeight: 'bold', color: '#6c5ce7', marginBottom: 8 },
  infoText: { fontSize: 13, color: '#666', lineHeight: 22 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', marginTop: 16, marginBottom: 4 },
  hint: { fontSize: 12, color: '#999', marginBottom: 8 },
  textArea: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14,
    fontSize: 13, minHeight: 120, lineHeight: 20,
  },
  screenshotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  screenshot: { width: 80, height: 80, borderRadius: 8 },
  addScreenshotBtn: {
    width: 80, height: 80, borderRadius: 8, borderWidth: 2,
    borderColor: '#6c5ce7', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  addScreenshotText: { color: '#6c5ce7', fontSize: 13, fontWeight: '600' },
  loadingSection: { alignItems: 'center', paddingVertical: 30 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6c5ce7' },
  analyzeBtn: {
    backgroundColor: '#6c5ce7', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 20,
  },
  analyzeBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  skipBtn: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14,
    alignItems: 'center', marginTop: 12,
  },
  skipPermBtn: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14,
    alignItems: 'center', marginTop: 12,
  },
  skipBtnText: { color: '#888', fontSize: 14 },
});
