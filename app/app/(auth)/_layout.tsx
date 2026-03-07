import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: '#6c5ce7' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: 'bold' },
    }}>
      <Stack.Screen name="role-select" options={{ headerShown: false }} />
      <Stack.Screen name="family-setup" options={{ title: '가족 설정' }} />
      <Stack.Screen name="child-add" options={{ title: '아이 등록' }} />
      <Stack.Screen name="sms-scan" options={{ title: '메시지 분석' }} />
      <Stack.Screen name="contact-confirm" options={{ title: '연락처 확인' }} />
      <Stack.Screen name="contact-add" options={{ title: '연락처 수동 추가' }} />
      <Stack.Screen name="schedule-photo" options={{ title: '스케줄 사진' }} />
      <Stack.Screen name="schedule-input" options={{ title: '스케줄 입력' }} />
    </Stack>
  );
}
