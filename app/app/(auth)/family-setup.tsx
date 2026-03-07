import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, SafeAreaView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';

export default function FamilySetup() {
  const { role } = useLocalSearchParams<{ role: string }>();
  const router = useRouter();
  const { register } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [familyCode, setFamilyCode] = useState('');
  const [loading, setLoading] = useState(false);

  const isMom = role === 'mom';

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('이름을 입력해주세요');
      return;
    }
    if (!isMom && !familyCode.trim()) {
      Alert.alert('가족 코드를 입력해주세요');
      return;
    }

    setLoading(true);
    try {
      const result = await register(role || 'mom', name, phone || undefined, familyCode || undefined);

      if (isMom) {
        Alert.alert(
          '가족 코드',
          `주양육자에게 이 코드를 알려주세요: ${result.family_code}`,
          [{ text: '다음', onPress: () => router.push('/(auth)/child-add') }]
        );
      } else {
        router.replace('/(caregiver)/');
      }
    } catch (e: any) {
      Alert.alert('오류', e.response?.data?.detail || '등록에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>{isMom ? '엄마 정보 입력' : '주양육자 합류'}</Text>

      <Text style={styles.label}>이름</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="이름을 입력하세요"
      />

      <Text style={styles.label}>전화번호</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="010-0000-0000"
        keyboardType="phone-pad"
      />

      {!isMom && (
        <>
          <Text style={styles.label}>가족 초대 코드</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={familyCode}
            onChangeText={setFamilyCode}
            placeholder="6자리 코드"
            keyboardType="number-pad"
            maxLength={6}
          />
        </>
      )}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? '처리 중...' : isMom ? '가족 만들기' : '합류하기'}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  heading: { fontSize: 20, fontWeight: 'bold', marginBottom: 24 },
  label: { fontSize: 13, color: '#666', marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14,
    fontSize: 15,
  },
  codeInput: { fontSize: 24, textAlign: 'center', letterSpacing: 8 },
  button: {
    backgroundColor: '#6c5ce7', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 32,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
