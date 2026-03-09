import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, TextInput, Modal, Alert,
} from 'react-native';
import { responsesAPI } from '../../src/services/api';
import { PendingResponse } from '../../src/types';

export default function ApprovalsScreen() {
  const [responses, setResponses] = useState<PendingResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editModal, setEditModal] = useState<{ visible: boolean; id: string; text: string }>({
    visible: false, id: '', text: '',
  });
  const [processing, setProcessing] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    try {
      const data = await responsesAPI.listPending();
      setResponses(data);
    } catch (err) {
      console.error('Failed to load pending responses:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadPending(); }, [loadPending]);

  const onRefresh = () => { setRefreshing(true); loadPending(); };

  const handleApprove = async (id: string) => {
    setProcessing(id);
    try {
      await responsesAPI.approve(id);
      setResponses(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      Alert.alert('오류', '승인에 실패했습니다.');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessing(id);
    try {
      await responsesAPI.reject(id);
      setResponses(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      Alert.alert('오류', '거절에 실패했습니다.');
    } finally {
      setProcessing(null);
    }
  };

  const handleEditSend = async () => {
    if (!editModal.text.trim()) return;
    setProcessing(editModal.id);
    try {
      await responsesAPI.edit(editModal.id, editModal.text);
      setResponses(prev => prev.filter(r => r.id !== editModal.id));
      setEditModal({ visible: false, id: '', text: '' });
    } catch (err) {
      Alert.alert('오류', '수정 발송에 실패했습니다.');
    } finally {
      setProcessing(null);
    }
  };

  const priorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return '#e74c3c';
      case 'normal': return '#f39c12';
      default: return '#95a5a6';
    }
  };

  const priorityLabel = (priority: string) => {
    switch (priority) {
      case 'urgent': return '긴급';
      case 'normal': return '일반';
      default: return '정보';
    }
  };

  const renderItem = ({ item }: { item: PendingResponse }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: priorityColor(item.priority) }]}>
          <Text style={styles.badgeText}>{priorityLabel(item.priority)}</Text>
        </View>
        <Text style={styles.contactName}>{item.contact_name}</Text>
        <Text style={styles.channel}>{item.channel}</Text>
      </View>

      <Text style={styles.sectionLabel}>원본 알림</Text>
      <Text style={styles.rawText}>{item.raw_notification}</Text>

      <Text style={styles.sectionLabel}>AI 초안 응답</Text>
      <View style={styles.draftBox}>
        <Text style={styles.draftText}>{item.draft_text}</Text>
      </View>

      <Text style={styles.confidence}>
        신뢰도: {(item.confidence_score * 100).toFixed(0)}%
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.approveBtn]}
          onPress={() => handleApprove(item.id)}
          disabled={processing === item.id}
        >
          <Text style={styles.btnText}>
            {processing === item.id ? '...' : '승인'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.editBtn]}
          onPress={() => setEditModal({ visible: true, id: item.id, text: item.draft_text })}
          disabled={processing === item.id}
        >
          <Text style={styles.btnText}>수정</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.rejectBtn]}
          onPress={() => handleReject(item.id)}
          disabled={processing === item.id}
        >
          <Text style={styles.rejectBtnText}>거절</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6c5ce7" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {responses.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>{'\\u2705'}</Text>
          <Text style={styles.emptyText}>모든 알림이 처리되었습니다</Text>
        </View>
      ) : (
        <FlatList
          data={responses}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      <Modal visible={editModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>응답 수정</Text>
            <TextInput
              style={styles.modalInput}
              value={editModal.text}
              onChangeText={(text) => setEditModal(prev => ({ ...prev, text }))}
              multiline
              placeholder="수정할 응답을 입력하세요"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btn, styles.editBtn]}
                onPress={handleEditSend}
                disabled={processing !== null}
              >
                <Text style={styles.btnText}>수정 발송</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.rejectBtn]}
                onPress={() => setEditModal({ visible: false, id: '', text: '' })}
              >
                <Text style={styles.rejectBtnText}>취소</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#666' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 8,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  contactName: { fontSize: 16, fontWeight: '600', flex: 1 },
  channel: { fontSize: 12, color: '#999' },

  sectionLabel: { fontSize: 11, color: '#999', marginBottom: 4, marginTop: 8 },
  rawText: { fontSize: 14, color: '#333', lineHeight: 20 },
  draftBox: {
    backgroundColor: '#f0f0ff',
    borderRadius: 8,
    padding: 12,
  },
  draftText: { fontSize: 14, color: '#333', lineHeight: 20 },
  confidence: { fontSize: 12, color: '#999', marginTop: 8, textAlign: 'right' },

  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  approveBtn: { backgroundColor: '#27ae60' },
  editBtn: { backgroundColor: '#3498db' },
  rejectBtn: { backgroundColor: '#f0f0f0' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  rejectBtnText: { color: '#666', fontWeight: '600', fontSize: 14 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    minHeight: 300,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
});
