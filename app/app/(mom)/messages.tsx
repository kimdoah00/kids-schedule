import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { messagesAPI } from '../../src/services/api';

interface MessageItem {
  id: string;
  raw_content: string;
  ai_summary: string | null;
  source_channel: string | null;
  source_app: string | null;
  schedule_impact: string | null;
  status: string;
  timestamp: string;
}

const CHANNEL_LABELS: Record<string, string> = {
  sms: 'SMS',
  kakao: '카톡',
  hiclass: '하이클래스',
};

const CHANNEL_COLORS: Record<string, string> = {
  sms: '#4caf50',
  kakao: '#fee500',
  hiclass: '#2196f3',
};

export default function MessagesScreen() {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    try {
      const data = await messagesAPI.list(7, filter || undefined);
      setMessages(data);
    } catch (e) {
      console.error('Messages load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  const onRefresh = () => { setRefreshing(true); loadMessages(); };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${mins}`;
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6c5ce7" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {[null, 'sms', 'kakao', 'hiclass'].map((ch) => (
          <TouchableOpacity
            key={ch || 'all'}
            style={[styles.filterBtn, filter === ch && styles.filterBtnActive]}
            onPress={() => setFilter(ch)}
          >
            <Text style={[styles.filterText, filter === ch && styles.filterTextActive]}>
              {ch ? CHANNEL_LABELS[ch] : '전체'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>수신된 알림이 없습니다</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.msgCard}>
            <View style={styles.msgHeader}>
              {item.source_channel && (
                <View style={[styles.channelBadge, { backgroundColor: CHANNEL_COLORS[item.source_channel] || '#999' }]}>
                  <Text style={[styles.channelText, item.source_channel === 'kakao' && { color: '#333' }]}>
                    {CHANNEL_LABELS[item.source_channel] || item.source_channel}
                  </Text>
                </View>
              )}
              <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
            </View>

            {item.ai_summary && (
              <Text style={styles.summaryText}>{item.ai_summary}</Text>
            )}
            <Text style={styles.rawText} numberOfLines={2}>{item.raw_content}</Text>

            {item.schedule_impact && (
              <View style={styles.impactBadge}>
                <Text style={styles.impactText}>{item.schedule_impact}</Text>
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 15, color: '#999' },
  filterRow: { flexDirection: 'row', padding: 12, gap: 8 },
  filterBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#e0e0e0',
  },
  filterBtnActive: { backgroundColor: '#6c5ce7' },
  filterText: { fontSize: 13, color: '#666' },
  filterTextActive: { color: '#fff', fontWeight: 'bold' },
  msgCard: {
    marginHorizontal: 16, marginBottom: 8, backgroundColor: '#fff',
    borderRadius: 10, padding: 12, elevation: 1,
  },
  msgHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  channelBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  channelText: { fontSize: 11, color: '#fff', fontWeight: 'bold' },
  timeText: { fontSize: 11, color: '#999' },
  summaryText: { fontSize: 14, color: '#333', fontWeight: '500', marginBottom: 4 },
  rawText: { fontSize: 13, color: '#888', lineHeight: 18 },
  impactBadge: {
    marginTop: 6, alignSelf: 'flex-start',
    backgroundColor: '#fff3e0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  impactText: { fontSize: 11, color: '#ff9800', fontWeight: 'bold' },
});
