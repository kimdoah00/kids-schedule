import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
  SafeAreaView, ActivityIndicator, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { onboardingAPI, scheduleAPI, childrenAPI } from '../../src/services/api';
import { Child } from '../../src/types';

const DAYS = ['월', '화', '수', '목', '금'];

export default function SchedulePhoto() {
  const router = useRouter();
  const [children, setChildren] = useState<Child[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadChildren();
  }, []);

  const loadChildren = async () => {
    try {
      const list = await childrenAPI.list();
      setChildren(list);
    } catch (e) {
      console.error(e);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('카메라 권한이 필요합니다');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0].base64) {
      setImage(result.assets[0].uri);
      analyzePhoto(result.assets[0].base64);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0].base64) {
      setImage(result.assets[0].uri);
      analyzePhoto(result.assets[0].base64);
    }
  };

  const analyzePhoto = async (base64: string) => {
    setLoading(true);
    try {
      const childName = children.length > 0 ? children[0].name : undefined;
      const res = await onboardingAPI.analyzeSchedulePhoto(base64, childName);
      setResults(res.schedules || []);
      if (res.schedules.length === 0) {
        Alert.alert('스케줄을 찾지 못했습니다', '사진이 선명한지 확인하고 다시 시도해주세요');
      }
    } catch (e: any) {
      Alert.alert('분석 실패', e.response?.data?.detail || '다시 시도해주세요');
    } finally {
      setLoading(false);
    }
  };

  const saveAll = async () => {
    if (children.length === 0) {
      Alert.alert('등록된 아이가 없습니다');
      return;
    }
    setLoading(true);
    try {
      const childId = children[0].id;
      for (const s of results) {
        for (const day of s.days) {
          await scheduleAPI.createBlock({
            child_id: childId,
            activity_name: s.activity_name,
            activity_type: s.activity_type,
            day_of_week: day,
            start_time: s.start_time,
            end_time: s.end_time,
            block_type: 'activity',
          });
        }
      }
      setSaved(true);
      Alert.alert('저장 완료', `${results.length}개 스케줄이 등록되었습니다`);
    } catch (e: any) {
      Alert.alert('저장 실패', e.response?.data?.detail || '다시 시도해주세요');
    } finally {
      setLoading(false);
    }
  };

  const goNext = () => {
    router.push('/(auth)/schedule-input');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <Text style={styles.heading}>스케줄 사진으로 등록</Text>
        <Text style={styles.desc}>
          기존 시간표나 스케줄표를 촬영하면 AI가 자동으로 읽어옵니다
        </Text>

        {!image ? (
          <View style={styles.photoSection}>
            <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
              <Text style={styles.photoBtnIcon}>📷</Text>
              <Text style={styles.photoBtnText}>사진 촬영</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoBtn} onPress={pickImage}>
              <Text style={styles.photoBtnIcon}>🖼️</Text>
              <Text style={styles.photoBtnText}>앨범에서 선택</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.previewSection}>
            <Image source={{ uri: image }} style={styles.preview} />
            <TouchableOpacity style={styles.retakeBtn} onPress={() => { setImage(null); setResults([]); }}>
              <Text style={styles.retakeBtnText}>다시 촬영</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && (
          <View style={styles.loadingSection}>
            <ActivityIndicator size="large" color="#6c5ce7" />
            <Text style={styles.loadingText}>AI가 스케줄을 분석 중...</Text>
          </View>
        )}

        {results.length > 0 && (
          <View style={styles.resultsSection}>
            <Text style={styles.resultsTitle}>AI가 찾은 스케줄</Text>
            {results.map((s, i) => (
              <View key={i} style={styles.resultCard}>
                <Text style={styles.resultName}>{s.activity_name}</Text>
                <Text style={styles.resultTime}>{s.start_time} - {s.end_time}</Text>
                <Text style={styles.resultDays}>
                  {s.days.map((d: number) => DAYS[d]).join(', ')}
                </Text>
              </View>
            ))}

            {!saved && (
              <TouchableOpacity style={styles.saveBtn} onPress={saveAll}>
                <Text style={styles.saveBtnText}>모두 저장하기</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.nextBtn} onPress={goNext}>
        <Text style={styles.nextBtnText}>
          {results.length > 0 ? '다음: 스케줄 수정/추가 →' : '건너뛰기: 직접 입력 →'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  heading: { fontSize: 20, fontWeight: 'bold' },
  desc: { fontSize: 13, color: '#888', marginTop: 4, marginBottom: 20 },
  photoSection: { flexDirection: 'row', gap: 12 },
  photoBtn: {
    flex: 1, borderWidth: 2, borderColor: '#6c5ce7', borderRadius: 16,
    borderStyle: 'dashed', padding: 30, alignItems: 'center',
  },
  photoBtnIcon: { fontSize: 36, marginBottom: 8 },
  photoBtnText: { fontSize: 14, color: '#6c5ce7', fontWeight: '600' },
  previewSection: { marginBottom: 16 },
  preview: { width: '100%', height: 200, borderRadius: 12, marginBottom: 8 },
  retakeBtn: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, alignItems: 'center',
  },
  retakeBtnText: { color: '#666', fontSize: 13 },
  loadingSection: { alignItems: 'center', paddingVertical: 30 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6c5ce7' },
  resultsSection: { marginTop: 16 },
  resultsTitle: { fontSize: 16, fontWeight: 'bold', color: '#6c5ce7', marginBottom: 8 },
  resultCard: {
    backgroundColor: '#f8f7ff', borderRadius: 12, padding: 14, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: '#6c5ce7',
  },
  resultName: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  resultTime: { fontSize: 13, color: '#666', marginTop: 4 },
  resultDays: { fontSize: 12, color: '#999', marginTop: 2 },
  saveBtn: {
    backgroundColor: '#6c5ce7', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  nextBtn: {
    backgroundColor: '#6c5ce7', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 16,
  },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
