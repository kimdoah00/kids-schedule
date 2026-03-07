import { Stack } from 'expo-router';

export default function CaregiverLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: '#27ae60' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: 'bold' },
    }}>
      <Stack.Screen name="index" options={{ title: '오늘의 스케줄' }} />
    </Stack>
  );
}
