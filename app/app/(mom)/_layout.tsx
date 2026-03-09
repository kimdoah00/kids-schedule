import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function MomLayout() {
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: '#6c5ce7' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: 'bold' },
      tabBarActiveTintColor: '#6c5ce7',
      tabBarInactiveTintColor: '#999',
      tabBarStyle: { paddingBottom: 4, height: 56 },
    }}>
      <Tabs.Screen
        name="chat"
        options={{
          title: 'AI 비서',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22 }}>💬</Text>,
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title: '타임라인',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22 }}>⏱️</Text>,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: '메시지',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22 }}>📨</Text>,
        }}
      />
      <Tabs.Screen
        name="approvals"
        options={{
          title: '승인',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22 }}>{'\\u2705'}</Text>,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: '스케줄',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22 }}>📅</Text>,
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: '연락처',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22 }}>👥</Text>,
        }}
      />
    </Tabs>
  );
}
