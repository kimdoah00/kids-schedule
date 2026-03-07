import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ScrollView, SafeAreaView, ActivityIndicator, Image,
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
  const [analyzed, setAnalyzed] = useState(false);

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
      // Parse pasted messages into structured format
      const lines = pastedMessages.split('\n').filter((l) => l.trim());
      const messages = lines.map((line) => ({
        phone_number: 'unknown',
        body: line.trim(),
        timestamp: new Date().toISOString(),
        sender_name: null,
      }));

      const res = await onboardingAPI.analyzeSms(messages);

      // Store results for next screens
      await AsyncStorage.setItem('onboarding_contacts', JSON.stringify(res.contacts || []));
      await AsyncStorage.setItem('onboarding_schedules', JSON.stringify(res.schedules || []));

      setAnalyzed(true);

      const contactCount = res.contacts?.length || 0;
      const scheduleCount = res.schedules?.length || 0;

      Alert.alert(
        'AI 분석 완료',
        `연락처 ${contactCount}개, 스케줄 패턴 ${scheduleCount}개를 찾았습니다.\n다음 화면에서 확인하세요.`,
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <Text style={styles.heading}>메시지 이력 분석</Text>
        <Text style={styles.desc}>
          엄마 폰에 매일 오는 입퇴실/도착 문자를 AI가 분석해서{'\n'}
          연락처와 스케줄을 자동으로 찾아드립니다
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>이런 메시지를 찾습니다</Text>
          <Text style={styles.infoText}>
            - "지윤이가 출석했습니다" (학교){'\n'}
            - "지윤이가 돌봄교실에 입실했습니다" (돌봄){'\n'}
            - "지윤이 셔틀 탑승했습니다" (셔틀){'\n'}
            - "지윤이가 도착했습니다" (학원)
          </Text>
        </View>

        <Text style={styles.sectionTitle}>방법 1: 메시지 붙여넣기</Text>
        <Text style={styles.hint}>문자앱에서 메시지를 복사해서 붙여넣으세요</Text>
        <TextInput
          style={styles.textArea}
          value={pastedMessages}
          onChangeText={setPastedMessages}
          placeholder={"[2026-03-06 09:00] 한빛초등학교: 지윤이가 출석했습니다\n[2026-03-06 13:30] 돌봄교실: 지윤이가 입실했습니다\n[2026-03-06 14:00] 돌봄교실: 지윤이가 퇴실했습니다\n[2026-03-06 14:20] 태권도: 지윤이가 도착했습니다"}
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
            <Text style={styles.loadingText}>AI가 메시지를 분석 중...</Text>
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
  heading: { fontSize: 20, fontWeight: 'bold' },
  desc: { fontSize: 13, color: '#888', marginTop: 4, marginBottom: 16, lineHeight: 20 },
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
  skipBtnText: { color: '#888', fontSize: 14 },
});
