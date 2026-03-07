import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, RefreshControl } from 'react-native';
import { childrenAPI, scheduleAPI } from '../../src/services/api';
import { Child, ScheduleBlock, GapInfo } from '../../src/types';

const DAYS = ['월', '화', '수', '목', '금'];

export default function ScheduleScreen() {
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState(new Date().getDay() - 1);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [gaps, setGaps] = useState<GapInfo[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadChildren();
  }, []);

  useEffect(() => {
    if (selectedChild) loadSchedule();
  }, [selectedChild, selectedDay]);

  const loadChildren = async () => {
    try {
      const list = await childrenAPI.list();
      setChildren(list);
      if (list.length > 0) setSelectedChild(list[0].id);
    } catch (e) {
      console.error(e);
    }
  };

  const loadSchedule = async () => {
    try {
      const day = selectedDay >= 0 && selectedDay < 5 ? selectedDay : 0;
      const [scheduleData, gapData] = await Promise.all([
        scheduleAPI.get(selectedChild, day),
        scheduleAPI.detectGaps(selectedChild, day),
      ]);
      setBlocks(scheduleData);
      setGaps(gapData);
    } catch (e) {
      console.error(e);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSchedule();
    setRefreshing(false);
  }, [selectedChild, selectedDay]);

  const getBlockColor = (type: string, blockType: string) => {
    if (blockType === 'transition') return '#fff3cd';
    switch (type) {
      case 'school': return '#d6eaf8';
      case 'care': return '#d5f5e3';
      case 'academy': return '#fdebd0';
      case 'shuttle': return '#fadbd8';
      default: return '#f2f3f4';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {children.length > 1 && (
        <View style={styles.childRow}>
          {children.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.childChip, selectedChild === c.id && styles.childChipActive]}
              onPress={() => setSelectedChild(c.id)}
            >
              <Text style={[styles.childText, selectedChild === c.id && styles.childTextActive]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.dayRow}>
        {DAYS.map((d, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.dayBtn, selectedDay === i && styles.dayBtnActive]}
            onPress={() => setSelectedDay(i)}
          >
            <Text style={[styles.dayText, selectedDay === i && styles.dayTextActive]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.timeline}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6c5ce7']} />}
      >
        {blocks.length === 0 && gaps.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyText}>{DAYS[selectedDay >= 0 ? selectedDay : 0]}요일 스케줄이 없습니다</Text>
            <Text style={styles.emptyHint}>AI 채팅에서 스케줄을 추가해보세요</Text>
          </View>
        ) : (
          <>
            {blocks.map((block) => (
              <View
                key={block.id}
                style={[styles.block, { backgroundColor: getBlockColor(block.activity_type, block.block_type) }]}
              >
                <View style={styles.blockTime}>
                  <Text style={styles.timeText}>{block.start_time}</Text>
                  <View style={styles.timeLine} />
                  <Text style={styles.timeText}>{block.end_time}</Text>
                </View>
                <View style={styles.blockContent}>
                  <Text style={styles.blockName}>
                    {block.block_type === 'transition' ? '🚶 ' : ''}{block.activity_name}
                  </Text>
                  {block.guardian_name ? (
                    <Text style={styles.guardianText}>담당: {block.guardian_name}</Text>
                  ) : (
                    <Text style={styles.noGuardian}>담당자 미지정</Text>
                  )}
                </View>
              </View>
            ))}

            {gaps.length > 0 && (
              <View style={styles.gapSection}>
                <Text style={styles.gapTitle}>보호자 공백</Text>
                {gaps.map((gap, i) => (
                  <View key={i} style={styles.gapCard}>
                    <Text style={styles.gapTime}>{gap.start_time} ~ {gap.end_time}</Text>
                    <Text style={styles.gapDetail}>
                      {gap.before_activity || '시작'} → {gap.after_activity || '끝'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  childRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  childChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd',
  },
  childChipActive: { backgroundColor: '#6c5ce7', borderColor: '#6c5ce7' },
  childText: { fontSize: 13, color: '#666' },
  childTextActive: { color: '#fff', fontWeight: 'bold' },
  dayRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, paddingHorizontal: 16 },
  dayBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff',
  },
  dayBtnActive: { backgroundColor: '#6c5ce7' },
  dayText: { fontSize: 14, color: '#666', fontWeight: '600' },
  dayTextActive: { color: '#fff' },
  timeline: { flex: 1, paddingHorizontal: 16 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#666', fontWeight: '600' },
  emptyHint: { fontSize: 13, color: '#999', marginTop: 4 },
  block: {
    flexDirection: 'row', borderRadius: 12, padding: 14, marginBottom: 8,
  },
  blockTime: { alignItems: 'center', marginRight: 14, width: 50 },
  timeText: { fontSize: 12, color: '#666', fontWeight: '600' },
  timeLine: { flex: 1, width: 2, backgroundColor: '#ccc', marginVertical: 4 },
  blockContent: { flex: 1, justifyContent: 'center' },
  blockName: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  guardianText: { fontSize: 12, color: '#27ae60', marginTop: 4 },
  noGuardian: { fontSize: 12, color: '#e74c3c', marginTop: 4, fontWeight: '600' },
  gapSection: { marginTop: 16, paddingBottom: 20 },
  gapTitle: { fontSize: 14, fontWeight: 'bold', color: '#e74c3c', marginBottom: 8 },
  gapCard: {
    backgroundColor: '#fff3f3', borderRadius: 8, padding: 12, marginBottom: 6,
    borderLeftWidth: 3, borderLeftColor: '#e74c3c',
  },
  gapTime: { fontSize: 14, fontWeight: 'bold', color: '#e74c3c' },
  gapDetail: { fontSize: 12, color: '#999', marginTop: 2 },
});
