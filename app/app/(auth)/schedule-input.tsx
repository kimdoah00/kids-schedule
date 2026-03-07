import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { childrenAPI, scheduleAPI } from '../../src/services/api';
import { Child } from '../../src/types';

const DAYS = ['월', '화', '수', '목', '금'];

const ACTIVITY_TYPES = [
  { key: 'school', label: '정규수업', icon: '🏫' },
  { key: 'care', label: '돌봄/늘봄', icon: '🏠' },
  { key: 'academy', label: '학원', icon: '📚' },
  { key: 'shuttle', label: '셔틀/이동', icon: '🚐' },
  { key: 'other', label: '기타', icon: '📋' },
];

export default function ScheduleInput() {
  const router = useRouter();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>('');
  const [activityName, setActivityName] = useState('');
  const [activityType, setActivityType] = useState('school');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [blocks, setBlocks] = useState<any[]>([]);

  useEffect(() => {
    loadChildren();
  }, []);

  const loadChildren = async () => {
    try {
      const list = await childrenAPI.list();
      setChildren(list);
      if (list.length > 0) setSelectedChild(list[0].id);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const addBlock = async () => {
    if (!activityName.trim()) {
      Alert.alert('활동 이름을 입력해주세요');
      return;
    }
    if (selectedDays.length === 0) {
      Alert.alert('요일을 선택해주세요');
      return;
    }
    if (!startTime || !endTime) {
      Alert.alert('시간을 입력해주세요 (예: 09:00)');
      return;
    }

    try {
      for (const day of selectedDays) {
        const block = await scheduleAPI.createBlock({
          child_id: selectedChild,
          activity_name: activityName.trim(),
          activity_type: activityType,
          day_of_week: day,
          start_time: startTime,
          end_time: endTime,
          block_type: 'activity',
        });
        setBlocks((prev) => [...prev, { ...block, day }]);
      }
      setActivityName('');
      setSelectedDays([]);
      setStartTime('');
      setEndTime('');
      Alert.alert('등록 완료', `${activityName} 스케줄이 추가되었습니다`);
    } catch (e: any) {
      Alert.alert('오류', e.response?.data?.detail || '등록 실패');
    }
  };

  const finish = () => {
    router.replace('/(mom)/chat');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <Text style={styles.heading}>주간 스케줄 입력</Text>
        <Text style={styles.desc}>아이의 고정 스케줄을 등록하세요</Text>

        {children.length > 1 && (
          <>
            <Text style={styles.label}>아이 선택</Text>
            <View style={styles.row}>
              {children.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, selectedChild === c.id && styles.chipActive]}
                  onPress={() => setSelectedChild(c.id)}
                >
                  <Text style={[styles.chipText, selectedChild === c.id && styles.chipTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {blocks.length > 0 && (
          <View style={styles.blockList}>
            <Text style={styles.label}>등록된 스케줄</Text>
            {blocks.map((b, i) => (
              <View key={i} style={styles.blockTag}>
                <Text style={styles.blockTagText}>
                  {DAYS[b.day_of_week]} {b.start_time}-{b.end_time} {b.activity_name}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.label}>활동 종류</Text>
        <View style={styles.row}>
          {ACTIVITY_TYPES.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.typeChip, activityType === t.key && styles.typeChipActive]}
              onPress={() => setActivityType(t.key)}
            >
              <Text style={styles.typeIcon}>{t.icon}</Text>
              <Text style={[styles.typeText, activityType === t.key && styles.typeTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>활동 이름</Text>
        <TextInput
          style={styles.input}
          value={activityName}
          onChangeText={setActivityName}
          placeholder="예: 태권도, 정규수업, 돌봄교실"
        />

        <Text style={styles.label}>요일</Text>
        <View style={styles.row}>
          {DAYS.map((d, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.dayBtn, selectedDays.includes(i) && styles.dayBtnActive]}
              onPress={() => toggleDay(i)}
            >
              <Text style={[styles.dayText, selectedDays.includes(i) && styles.dayTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.timeRow}>
          <View style={styles.timeCol}>
            <Text style={styles.label}>시작 시간</Text>
            <TextInput
              style={styles.input}
              value={startTime}
              onChangeText={setStartTime}
              placeholder="09:00"
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={styles.timeCol}>
            <Text style={styles.label}>종료 시간</Text>
            <TextInput
              style={styles.input}
              value={endTime}
              onChangeText={setEndTime}
              placeholder="13:20"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={addBlock}>
          <Text style={styles.addBtnText}>+ 스케줄 추가</Text>
        </TouchableOpacity>
      </ScrollView>

      <TouchableOpacity style={styles.nextBtn} onPress={finish}>
        <Text style={styles.nextBtnText}>완료 - AI 채팅 시작하기</Text>
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
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16,
    borderWidth: 1, borderColor: '#ddd',
  },
  chipActive: { backgroundColor: '#6c5ce7', borderColor: '#6c5ce7' },
  chipText: { fontSize: 13, color: '#666' },
  chipTextActive: { color: '#fff', fontWeight: 'bold' },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16,
    borderWidth: 1, borderColor: '#ddd',
  },
  typeChipActive: { backgroundColor: '#6c5ce7', borderColor: '#6c5ce7' },
  typeIcon: { fontSize: 14 },
  typeText: { fontSize: 12, color: '#666' },
  typeTextActive: { color: '#fff', fontWeight: 'bold' },
  dayBtn: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1,
    borderColor: '#ddd', alignItems: 'center', justifyContent: 'center',
  },
  dayBtnActive: { backgroundColor: '#6c5ce7', borderColor: '#6c5ce7' },
  dayText: { fontSize: 14, color: '#666' },
  dayTextActive: { color: '#fff', fontWeight: 'bold' },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeCol: { flex: 1 },
  blockList: { marginBottom: 8 },
  blockTag: {
    backgroundColor: '#e8e6ff', borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 8, marginBottom: 4,
  },
  blockTagText: { fontSize: 13, color: '#6c5ce7' },
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
