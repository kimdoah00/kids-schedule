import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
  SafeAreaView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { contactsAPI } from '../../src/services/api';

const ROLE_MAP: Record<string, { label: string; icon: string }> = {
  teacher: { label: '선생님', icon: '👩‍🏫' },
  caregiver: { label: '주양육자', icon: '👵' },
  shuttle: { label: '셔틀', icon: '🚐' },
  admin: { label: '행정', icon: '📋' },
};

const CHANNEL_MAP: Record<string, { label: string; color: string }> = {
  kakao: { label: '카톡', color: '#fff3cd' },
  sms: { label: '문자', color: '#e3fcef' },
  hiclass: { label: '하이클래스', color: '#d6eaf8' },
};

interface DetectedContact {
  phone_number: string;
  detected_name: string | null;
  detected_role: string;
  channel: string;
  pattern: string;
  sample_messages: string[];
  selected: boolean;
}

export default function ContactConfirm() {
  const router = useRouter();
  const [contacts, setContacts] = useState<DetectedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDetected();
  }, []);

  const loadDetected = async () => {
    try {
      const stored = await AsyncStorage.getItem('onboarding_contacts');
      if (stored) {
        const parsed = JSON.parse(stored);
        setContacts(parsed.map((c: any) => ({ ...c, selected: true })));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleContact = (idx: number) => {
    setContacts((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, selected: !c.selected } : c))
    );
  };

  const saveSelected = async () => {
    const selected = contacts.filter((c) => c.selected);
    if (selected.length === 0) {
      router.push('/(auth)/schedule-photo');
      return;
    }

    setSaving(true);
    try {
      for (const c of selected) {
        await contactsAPI.create({
          name: c.detected_name || c.phone_number,
          role: c.detected_role as any,
          phone: c.phone_number,
          channel: c.channel as any,
          linked_child_ids: null,
          organization: null,
        });
      }
      Alert.alert('저장 완료', `${selected.length}개 연락처가 등록되었습니다`);
      router.push('/(auth)/schedule-photo');
    } catch (e: any) {
      Alert.alert('저장 실패', e.response?.data?.detail || '다시 시도해주세요');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#6c5ce7" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <Text style={styles.heading}>AI가 찾은 연락처</Text>
        <Text style={styles.desc}>확인하고 저장할 연락처를 선택하세요</Text>

        {contacts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>감지된 연락처가 없습니다</Text>
            <Text style={styles.emptyHint}>다음 단계에서 직접 추가할 수 있습니다</Text>
          </View>
        ) : (
          contacts.map((c, i) => {
            const roleInfo = ROLE_MAP[c.detected_role] || { label: c.detected_role, icon: '👤' };
            const channelInfo = CHANNEL_MAP[c.channel] || { label: c.channel, color: '#f2f3f4' };

            return (
              <TouchableOpacity
                key={i}
                style={[styles.card, c.selected && styles.cardSelected]}
                onPress={() => toggleContact(i)}
              >
                <View style={styles.cardCheck}>
                  <Text style={styles.checkIcon}>{c.selected ? '✅' : '⬜'}</Text>
                </View>
                <View style={styles.cardContent}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardName}>
                      {roleInfo.icon} {c.detected_name || c.phone_number}
                    </Text>
                    <View style={[styles.channelBadge, { backgroundColor: channelInfo.color }]}>
                      <Text style={styles.channelText}>{channelInfo.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardRole}>{roleInfo.label}</Text>
                  <Text style={styles.cardPattern}>{c.pattern}</Text>
                  {c.sample_messages.length > 0 && (
                    <Text style={styles.cardSample} numberOfLines={2}>
                      예: "{c.sample_messages[0]}"
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={saveSelected}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>
          {saving ? '저장 중...' : contacts.filter((c) => c.selected).length > 0
            ? `${contacts.filter((c) => c.selected).length}개 저장하고 다음 →`
            : '건너뛰기 →'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  heading: { fontSize: 20, fontWeight: 'bold' },
  desc: { fontSize: 13, color: '#888', marginTop: 4, marginBottom: 20 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#666', fontWeight: '600' },
  emptyHint: { fontSize: 13, color: '#999', marginTop: 4 },
  card: {
    flexDirection: 'row', borderWidth: 1, borderColor: '#eee',
    borderRadius: 12, padding: 14, marginBottom: 10,
  },
  cardSelected: { borderColor: '#6c5ce7', backgroundColor: '#faf9ff' },
  cardCheck: { marginRight: 12, justifyContent: 'center' },
  checkIcon: { fontSize: 20 },
  cardContent: { flex: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  channelBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  channelText: { fontSize: 11, fontWeight: '600' },
  cardRole: { fontSize: 12, color: '#6c5ce7', marginTop: 4 },
  cardPattern: { fontSize: 12, color: '#666', marginTop: 2 },
  cardSample: { fontSize: 11, color: '#999', marginTop: 4, fontStyle: 'italic' },
  saveBtn: {
    backgroundColor: '#6c5ce7', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 12,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
