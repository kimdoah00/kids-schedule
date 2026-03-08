import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { childrenAPI, checkinAPI } from '../../src/services/api';

interface TimelineBlock {
  block_id: string;
  activity_name: string;
  block_type: string;
  start_time: string;
  end_time: string;
  guardian_name: string | null;
  status: string;
  checkin_events: { type: string; time: string; message: string }[];
}

interface ChildTimeline {
  childId: string;
  childName: string;
  timeline: TimelineBlock[];
  anomalies: { type: string; activity: string; message: string }[];
}

export default function TimelineScreen() {
  const [data, setData] = useState<ChildTimeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTimeline = useCallback(async () => {
    try {
      const children = await childrenAPI.list();
      const timelines: ChildTimeline[] = [];

      for (const child of children) {
        const result = await checkinAPI.getToday(child.id);
        timelines.push({
          childId: child.id,
          childName: child.name,
          timeline: result.timeline,
          anomalies: result.anomalies,
        });
      }
      setData(timelines);
    } catch (e) {
      console.error('Timeline load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadTimeline(); }, [loadTimeline]);

  const onRefresh = () => { setRefreshing(true); loadTimeline(); };

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#4caf50';
      case 'current': return '#2196f3';
      case 'missed': return '#f44336';
      default: return '#bbb';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'completed': return '완료';
      case 'current': return '진행중';
      case 'missed': return '누락';
      default: return '예정';
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6c5ce7" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={data}
      keyExtractor={(item) => item.childId}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>등록된 아이가 없습니다</Text>
        </View>
      }
      renderItem={({ item: child }) => (
        <View style={styles.childSection}>
          <Text style={styles.childName}>{child.childName}</Text>

          {child.anomalies.length > 0 && (
            <View style={styles.anomalyBox}>
              {child.anomalies.map((a, i) => (
                <Text key={i} style={styles.anomalyText}>{a.message}</Text>
              ))}
            </View>
          )}

          {child.timeline.map((block) => (
            <View key={block.block_id} style={styles.blockRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor(block.status) }]} />
              <View style={styles.blockContent}>
                <View style={styles.blockHeader}>
                  <Text style={styles.blockTime}>{block.start_time}-{block.end_time}</Text>
                  <Text style={[styles.statusBadge, { color: statusColor(block.status) }]}>
                    {statusLabel(block.status)}
                  </Text>
                </View>
                <Text style={styles.blockName}>{block.activity_name}</Text>
                {block.guardian_name && (
                  <Text style={styles.guardianText}>담당: {block.guardian_name}</Text>
                )}
                {!block.guardian_name && (
                  <Text style={styles.noGuardianText}>담당자 미정</Text>
                )}
                {block.checkin_events.map((ev, i) => (
                  <Text key={i} style={styles.eventText}>
                    {ev.time} {ev.type === 'enter' ? '입실' : ev.type === 'exit' ? '퇴실' : ev.type}
                  </Text>
                ))}
              </View>
            </View>
          ))}

          {child.timeline.length === 0 && (
            <Text style={styles.noScheduleText}>오늘 스케줄이 없습니다</Text>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 15, color: '#999' },
  childSection: { marginHorizontal: 16, marginTop: 16 },
  childName: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  anomalyBox: {
    backgroundColor: '#fff3f3', borderRadius: 8, padding: 10, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: '#f44336',
  },
  anomalyText: { fontSize: 13, color: '#f44336' },
  blockRow: { flexDirection: 'row', marginBottom: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6, marginRight: 10 },
  blockContent: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12, elevation: 1,
  },
  blockHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  blockTime: { fontSize: 13, fontWeight: 'bold', color: '#333' },
  statusBadge: { fontSize: 11, fontWeight: 'bold' },
  blockName: { fontSize: 15, color: '#333', marginBottom: 2 },
  guardianText: { fontSize: 12, color: '#666' },
  noGuardianText: { fontSize: 12, color: '#ff9800', fontWeight: 'bold' },
  eventText: { fontSize: 12, color: '#4caf50', marginTop: 4 },
  noScheduleText: { fontSize: 14, color: '#999', textAlign: 'center', padding: 20 },
});
