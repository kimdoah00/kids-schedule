import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, Platform, Alert, SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { chatAPI } from '../../src/services/api';
import { ChatMessage, DraftMessage } from '../../src/types';

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '안녕하세요! 키즈스케줄 AI 비서입니다.\n\n아이 스케줄 변경, 선생님 연락, 공백 확인 등 무엇이든 물어보세요.\n\n예시:\n- "내일 태권도 쉬어"\n- "수요일 스케줄 보여줘"\n- "이번 주 공백 있어?"',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await chatAPI.send(text);
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.response,
        timestamp: new Date().toISOString(),
        action_type: res.action_type || undefined,
        draft_messages: res.draft_messages || undefined,
        gaps_detected: res.gaps_detected || undefined,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e: any) {
      const errMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '죄송해요, 오류가 발생했습니다. 다시 시도해주세요.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAndSend = (draft: DraftMessage) => {
    await Clipboard.setStringAsync(draft.draft_text);
    Alert.alert(
      '메시지 복사 완료',
      `${draft.contact_name}에게 보낼 메시지가 클립보드에 복사되었습니다.\n\n채널: ${draft.channel}\n\n앱에서 붙여넣기 해주세요.`,
      [{ text: '확인' }]
    );
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
          <Text style={[styles.msgText, isUser && styles.msgTextUser]}>{item.content}</Text>
        </View>

        {item.draft_messages && item.draft_messages.length > 0 && (
          <View style={styles.draftsContainer}>
            <Text style={styles.draftTitle}>메시지 초안</Text>
            {item.draft_messages.map((draft, idx) => (
              <View key={idx} style={styles.draftCard}>
                <View style={styles.draftHeader}>
                  <Text style={styles.draftTo}>{draft.contact_name}</Text>
                  <Text style={styles.draftChannel}>{draft.channel}</Text>
                </View>
                <Text style={styles.draftText}>{draft.draft_text}</Text>
                <TouchableOpacity
                  style={styles.draftBtn}
                  onPress={() => handleCopyAndSend(draft)}
                >
                  <Text style={styles.draftBtnText}>복사하고 보내기</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {item.gaps_detected && item.gaps_detected.length > 0 && (
          <View style={styles.gapsContainer}>
            <Text style={styles.gapTitle}>보호자 공백 감지</Text>
            {item.gaps_detected.map((gap, idx) => (
              <View key={idx} style={styles.gapCard}>
                <Text style={styles.gapText}>
                  {['월','화','수','목','금'][gap.day_of_week]} {gap.start_time} ~ {gap.end_time}
                </Text>
                <Text style={styles.gapDetail}>
                  {gap.before_activity || '?'} → {gap.after_activity || '?'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#6c5ce7" />
            <Text style={styles.loadingText}>AI가 생각 중...</Text>
          </View>
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="메시지를 입력하세요..."
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
          >
            <Text style={styles.sendBtnText}>전송</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  flex: { flex: 1 },
  list: { padding: 16, paddingBottom: 8 },
  msgRow: { marginBottom: 12 },
  msgRowUser: { alignItems: 'flex-end' },
  bubble: { maxWidth: '85%', padding: 14, borderRadius: 16 },
  bubbleUser: { backgroundColor: '#6c5ce7', borderBottomRightRadius: 4 },
  bubbleAi: { backgroundColor: '#fff', borderBottomLeftRadius: 4, elevation: 1 },
  msgText: { fontSize: 15, lineHeight: 22, color: '#333' },
  msgTextUser: { color: '#fff' },
  draftsContainer: { marginTop: 8, maxWidth: '85%' },
  draftTitle: { fontSize: 12, fontWeight: 'bold', color: '#6c5ce7', marginBottom: 4 },
  draftCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: '#6c5ce7', elevation: 1,
  },
  draftHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  draftTo: { fontSize: 13, fontWeight: 'bold', color: '#333' },
  draftChannel: {
    fontSize: 11, color: '#6c5ce7', backgroundColor: '#e8e6ff',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
  },
  draftText: { fontSize: 14, color: '#555', lineHeight: 20, marginBottom: 8 },
  draftBtn: {
    backgroundColor: '#6c5ce7', borderRadius: 8, padding: 10, alignItems: 'center',
  },
  draftBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  gapsContainer: { marginTop: 8, maxWidth: '85%' },
  gapTitle: { fontSize: 12, fontWeight: 'bold', color: '#e74c3c', marginBottom: 4 },
  gapCard: {
    backgroundColor: '#fff3f3', borderRadius: 8, padding: 10, marginBottom: 4,
    borderLeftWidth: 3, borderLeftColor: '#e74c3c',
  },
  gapText: { fontSize: 13, fontWeight: 'bold', color: '#e74c3c' },
  gapDetail: { fontSize: 12, color: '#999', marginTop: 2 },
  loadingRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
    paddingVertical: 8, gap: 8,
  },
  loadingText: { fontSize: 13, color: '#999' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', gap: 8,
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: '#6c5ce7', borderRadius: 20, paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
});
