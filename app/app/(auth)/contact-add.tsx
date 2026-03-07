import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { contactsAPI } from '../../src/services/api';
import { Contact } from '../../src/types';

const ROLES = [
  { key: 'teacher', label: '선생님', icon: '👩‍🏫' },
  { key: 'caregiver', label: '주양육자', icon: '👵' },
  { key: 'shuttle', label: '셔틀', icon: '🚐' },
  { key: 'admin', label: '행정', icon: '📋' },
];

const CHANNELS = [
  { key: 'kakao', label: '카톡', color: '#fff3cd' },
  { key: 'sms', label: '문자', color: '#e3fcef' },
  { key: 'hiclass', label: '하이클래스', color: '#d6eaf8' },
];

export default function ContactAdd() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('teacher');
  const [channel, setChannel] = useState('kakao');
  const [org, setOrg] = useState('');

  const addContact = async () => {
    if (!name.trim()) {
      Alert.alert('이름을 입력해주세요');
      return;
    }
    try {
      const contact = await contactsAPI.create({
        name: name.trim(),
        role: role as any,
        phone: phone.trim() || null,
        channel: channel as any,
        linked_child_ids: null,
        organization: org.trim() || null,
      });
      setContacts([...contacts, contact]);
      setName('');
      setPhone('');
      setOrg('');
    } catch (e: any) {
      Alert.alert('오류', e.response?.data?.detail || '등록 실패');
    }
  };

  const goNext = () => {
    router.push('/(auth)/schedule-input');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <Text style={styles.heading}>연락처 등록</Text>
        <Text style={styles.desc}>선생님, 주양육자, 셔틀기사 등을 등록하세요</Text>

        {contacts.length > 0 && (
          <View style={styles.list}>
            {contacts.map((c) => (
              <View key={c.id} style={styles.tag}>
                <Text style={styles.tagText}>{c.name} ({c.channel})</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.label}>역할</Text>
        <View style={styles.row}>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r.key}
              style={[styles.chip, role === r.key && styles.chipActive]}
              onPress={() => setRole(r.key)}
            >
              <Text style={styles.chipIcon}>{r.icon}</Text>
              <Text style={[styles.chipText, role === r.key && styles.chipTextActive]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>이름</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="예: 태권도 관장님" />

        <Text style={styles.label}>전화번호</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="010-0000-0000" keyboardType="phone-pad" />

        <Text style={styles.label}>소속 (선택)</Text>
        <TextInput style={styles.input} value={org} onChangeText={setOrg} placeholder="예: 무적태권도" />

        <Text style={styles.label}>연락 채널</Text>
        <View style={styles.row}>
          {CHANNELS.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={[styles.channelChip, channel === c.key && { backgroundColor: c.color, borderColor: c.color }]}
              onPress={() => setChannel(c.key)}
            >
              <Text style={styles.channelText}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={addContact}>
          <Text style={styles.addBtnText}>+ 연락처 추가</Text>
        </TouchableOpacity>
      </ScrollView>

      <TouchableOpacity style={styles.nextBtn} onPress={goNext}>
        <Text style={styles.nextBtnText}>다음: 스케줄 입력 →</Text>
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
    borderWidth: 1, borderColor: '#ddd',
  },
  chipActive: { backgroundColor: '#6c5ce7', borderColor: '#6c5ce7' },
  chipIcon: { fontSize: 16 },
  chipText: { fontSize: 12, color: '#666' },
  chipTextActive: { color: '#fff', fontWeight: 'bold' },
  channelChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16,
    borderWidth: 1, borderColor: '#ddd',
  },
  channelText: { fontSize: 12 },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  tag: { backgroundColor: '#e8e6ff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontSize: 12, color: '#6c5ce7' },
  addBtn: {
    borderWidth: 1, borderColor: '#6c5ce7', borderRadius: 10,
    padding: 14, alignItems: 'center', marginTop: 20, borderStyle: 'dashed',
  },
  addBtnText: { color: '#6c5ce7', fontSize: 14, fontWeight: '600' },
  nextBtn: {
    backgroundColor: '#6c5ce7', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 16,
  },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
