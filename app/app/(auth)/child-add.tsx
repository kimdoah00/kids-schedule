import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, FlatList, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { childrenAPI } from '../../src/services/api';
import { Child } from '../../src/types';

export default function ChildAdd() {
  const router = useRouter();
  const [children, setChildren] = useState<Child[]>([]);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('1');
  const [school, setSchool] = useState('');

  const addChild = async () => {
    if (!name.trim()) {
      Alert.alert('아이 이름을 입력해주세요');
      return;
    }
    try {
      const child = await childrenAPI.create({
        name: name.trim(),
        grade: parseInt(grade),
        school: school.trim() || null,
      });
      setChildren([...children, child]);
      setName('');
      setSchool('');
    } catch (e: any) {
      Alert.alert('오류', e.response?.data?.detail || '등록 실패');
    }
  };

  const goNext = () => {
    if (children.length === 0) {
      Alert.alert('아이를 한 명 이상 등록해주세요');
      return;
    }
    router.push('/(auth)/contact-add');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>아이 등록</Text>
      <Text style={styles.desc}>스케줄을 관리할 아이를 등록해주세요</Text>

      {children.length > 0 && (
        <View style={styles.list}>
          {children.map((c) => (
            <View key={c.id} style={styles.childTag}>
              <Text style={styles.childTagText}>{c.name} ({c.grade}학년)</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.label}>이름</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="아이 이름" />

      <Text style={styles.label}>학년</Text>
      <View style={styles.gradeRow}>
        {['1', '2', '3'].map((g) => (
          <TouchableOpacity
            key={g}
            style={[styles.gradeBtn, grade === g && styles.gradeBtnActive]}
            onPress={() => setGrade(g)}
          >
            <Text style={[styles.gradeText, grade === g && styles.gradeTextActive]}>{g}학년</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>학교 (선택)</Text>
      <TextInput style={styles.input} value={school} onChangeText={setSchool} placeholder="한빛초등학교" />

      <TouchableOpacity style={styles.addBtn} onPress={addChild}>
        <Text style={styles.addBtnText}>+ 아이 추가</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.nextBtn} onPress={goNext}>
        <Text style={styles.nextBtnText}>다음 →</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  heading: { fontSize: 20, fontWeight: 'bold' },
  desc: { fontSize: 13, color: '#888', marginTop: 4, marginBottom: 20 },
  label: { fontSize: 13, color: '#666', marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 15 },
  gradeRow: { flexDirection: 'row', gap: 8 },
  gradeBtn: {
    flex: 1, padding: 12, borderRadius: 10, borderWidth: 1,
    borderColor: '#ddd', alignItems: 'center',
  },
  gradeBtnActive: { backgroundColor: '#6c5ce7', borderColor: '#6c5ce7' },
  gradeText: { fontSize: 14, color: '#666' },
  gradeTextActive: { color: '#fff', fontWeight: 'bold' },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  childTag: { backgroundColor: '#e8e6ff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  childTagText: { fontSize: 13, color: '#6c5ce7', fontWeight: '600' },
  addBtn: {
    borderWidth: 1, borderColor: '#6c5ce7', borderRadius: 10,
    padding: 14, alignItems: 'center', marginTop: 20, borderStyle: 'dashed',
  },
  addBtnText: { color: '#6c5ce7', fontSize: 14, fontWeight: '600' },
  nextBtn: {
    backgroundColor: '#6c5ce7', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 'auto',
  },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
