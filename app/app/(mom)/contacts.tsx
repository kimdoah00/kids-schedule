import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, SafeAreaView,
  RefreshControl, Alert, TextInput, Modal,
} from 'react-native';
import { contactsAPI } from '../../src/services/api';
import { Contact } from '../../src/types';

const ROLE_INFO: Record<string, { label: string; icon: string }> = {
  teacher: { label: '선생님', icon: '👩‍🏫' },
  caregiver: { label: '주양육자', icon: '👵' },
  shuttle: { label: '셔틀', icon: '🚐' },
  admin: { label: '행정', icon: '📋' },
};

const CHANNEL_INFO: Record<string, { label: string; color: string }> = {
  kakao: { label: '카톡', color: '#fff3cd' },
  sms: { label: '문자', color: '#e3fcef' },
  hiclass: { label: '하이클래스', color: '#d6eaf8' },
  phone: { label: '전화', color: '#f2f3f4' },
};

export default function ContactsScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('teacher');
  const [channel, setChannel] = useState('kakao');
  const [org, setOrg] = useState('');

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const list = await contactsAPI.list();
      setContacts(list);
    } catch (e) {
      console.error(e);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadContacts();
    setRefreshing(false);
  }, []);

  const addContact = async () => {
    if (!name.trim()) {
      Alert.alert('이름을 입력해주세요');
      return;
    }
    try {
      await contactsAPI.create({
        name: name.trim(),
        role: role as any,
        phone: phone.trim() || null,
        channel: channel as any,
        linked_child_ids: null,
        organization: org.trim() || null,
      });
      setShowAdd(false);
      setName('');
      setPhone('');
      setOrg('');
      loadContacts();
    } catch (e: any) {
      Alert.alert('오류', e.response?.data?.detail || '등록 실패');
    }
  };

  const deleteContact = (contact: Contact) => {
    Alert.alert(
      '삭제 확인',
      `${contact.name}을(를) 삭제하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제', style: 'destructive',
          onPress: async () => {
            try {
              await contactsAPI.delete(contact.id);
              loadContacts();
            } catch (e) {
              Alert.alert('삭제 실패');
            }
          },
        },
      ]
    );
  };

  const renderContact = ({ item }: { item: Contact }) => {
    const roleInfo = ROLE_INFO[item.role] || { label: item.role, icon: '👤' };
    const channelInfo = CHANNEL_INFO[item.channel] || { label: item.channel, color: '#f2f3f4' };

    return (
      <TouchableOpacity style={styles.card} onLongPress={() => deleteContact(item)}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardIcon}>{roleInfo.icon}</Text>
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardOrg}>{item.organization || roleInfo.label}</Text>
          {item.phone && <Text style={styles.cardPhone}>{item.phone}</Text>}
        </View>
        <View style={[styles.channelBadge, { backgroundColor: channelInfo.color }]}>
          <Text style={styles.channelBadgeText}>{channelInfo.label}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={contacts}
        renderItem={renderContact}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6c5ce7']} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>등록된 연락처가 없습니다</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>연락처 추가</Text>

            <Text style={styles.label}>역할</Text>
            <View style={styles.row}>
              {Object.entries(ROLE_INFO).map(([key, info]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, role === key && styles.chipActive]}
                  onPress={() => setRole(key)}
                >
                  <Text>{info.icon} {info.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>이름</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="이름" />

            <Text style={styles.label}>전화번호</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="010-0000-0000" keyboardType="phone-pad" />

            <Text style={styles.label}>소속</Text>
            <TextInput style={styles.input} value={org} onChangeText={setOrg} placeholder="소속 (선택)" />

            <Text style={styles.label}>채널</Text>
            <View style={styles.row}>
              {Object.entries(CHANNEL_INFO).map(([key, info]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, channel === key && { backgroundColor: info.color }]}
                  onPress={() => setChannel(key)}
                >
                  <Text>{info.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addContact}>
                <Text style={styles.saveBtnText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  list: { padding: 16 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 16, marginBottom: 8, elevation: 1,
  },
  cardLeft: { marginRight: 12 },
  cardIcon: { fontSize: 28 },
  cardContent: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  cardOrg: { fontSize: 12, color: '#888', marginTop: 2 },
  cardPhone: { fontSize: 12, color: '#666', marginTop: 2 },
  channelBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  channelBadgeText: { fontSize: 11, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#666' },
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#6c5ce7', alignItems: 'center',
    justifyContent: 'center', elevation: 4,
  },
  fabText: { fontSize: 28, color: '#fff', marginTop: -2 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '85%',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  label: { fontSize: 12, color: '#666', marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
    borderWidth: 1, borderColor: '#ddd',
  },
  chipActive: { backgroundColor: '#e8e6ff', borderColor: '#6c5ce7' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center',
  },
  cancelBtnText: { color: '#666', fontSize: 15 },
  saveBtn: {
    flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#6c5ce7', alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
