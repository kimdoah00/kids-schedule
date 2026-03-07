import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { childrenAPI, scheduleAPI, checkinAPI } from '../../src/services/api';
import { useAuth } from '../../src/context/AuthContext';
import { Child, ScheduleBlock } from '../../src/types';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function CaregiverHome() {
  const { logout } = useAuth();
  const router = useRouter();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>('');
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date();
  const dayOfWeek = today.getDay() - 1; // 0=Mon

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedChild) loadSchedule();
  }, [selectedChild]);

  const loadData = async () => {
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
      if (dayOfWeek < 0 || dayOfWeek > 4) {
        setBlocks([]);
        setTimeline([]);
        return;
      }
      const [scheduleData, timelineData] = await Promise.all([
        scheduleAPI.get(selectedChild, dayOfWeek),
        checkinAPI.getToday(selectedChild).catch(() => ({ timeline: [] })),
      ]);
      setBlocks(scheduleData);
      setTimeline(timelineData.timeline || []);
    } catch (e) {
      console.error(e);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSchedule();
    setRefreshing(false);
  }, [selectedChild]);

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'completed': return { bg: '#d5f5e3', border: '#27ae60' };
      case 'current': return { bg: '#fff3cd', border: '#f39c12' };
      case 'missed': return { bg: '#fadbd8', border: '#e74c3c' };
      default: return { bg: '#f2f3f4', border: '#bbb' };
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return '완료';
      case 'current': return '진행 중';
      case 'missed': return '미확인';
      default: return '예정';
    }
  };

  const isWeekend = dayOfWeek < 0 || dayOfWeek > 4;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.dateText}>
            {today.getMonth() + 1}월 {today.getDate()}일 ({DAYS[today.getDay()]})
          </Text>
          <Text style={styles.headerHint}>5분마다 자동 갱신됩니다</Text>
        </View>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </TouchableOpacity>
      </View>

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

      <ScrollView
        style={styles.timeline}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#27ae60']} />}
      >
        {isWeekend ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🌈</Text>
            <Text style={styles.emptyText}>주말이에요! 오늘은 쉬는 날</Text>
          </View>
        ) : blocks.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyText}>오늘 등록된 스케줄이 없습니다</Text>
          </View>
        ) : (
          blocks.map((block) => {
            const timelineItem = timeline.find((t: any) => t.block_id === block.id);
            const status = timelineItem?.status || 'upcoming';
            const statusStyle = getStatusStyle(status);

            return (
              <View
                key={block.id}
                style={[styles.block, { backgroundColor: statusStyle.bg, borderLeftColor: statusStyle.border }]}
              >
                <View style={styles.blockTop}>
                  <Text style={styles.blockTime}>{block.start_time} - {block.end_time}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.border }]}>
                    <Text style={styles.statusText}>{getStatusText(status)}</Text>
                  </View>
                </View>
                <Text style={styles.blockName}>
                  {block.block_type === 'transition' ? '🚶 ' : ''}{block.activity_name}
                </Text>
                {block.guardian_name && (
                  <Text style={styles.guardianText}>담당: {block.guardian_name}</Text>
                )}
                {timelineItem?.checkin_events?.map((evt: any, i: number) => (
                  <Text key={i} style={styles.checkinText}>
                    {evt.type === 'enter' ? '입실' : evt.type === 'exit' ? '퇴실' : evt.type === 'board' ? '탑승' : '도착'} {evt.time}
                  </Text>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  dateText: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  headerHint: { fontSize: 11, color: '#999', marginTop: 2 },
  logoutText: { fontSize: 13, color: '#e74c3c' },
  childRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  childChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd',
  },
  childChipActive: { backgroundColor: '#27ae60', borderColor: '#27ae60' },
  childText: { fontSize: 13, color: '#666' },
  childTextActive: { color: '#fff', fontWeight: 'bold' },
  timeline: { flex: 1, padding: 16 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#666' },
  block: {
    borderRadius: 12, padding: 16, marginBottom: 10, borderLeftWidth: 4,
  },
  blockTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  blockTime: { fontSize: 13, color: '#666', fontWeight: '600' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, color: '#fff', fontWeight: 'bold' },
  blockName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  guardianText: { fontSize: 12, color: '#27ae60', marginTop: 4 },
  checkinText: { fontSize: 11, color: '#6c5ce7', marginTop: 2 },
});
