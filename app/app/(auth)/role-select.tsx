import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';

export default function RoleSelect() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.logo}>
        <Text style={styles.icon}>📅</Text>
        <Text style={styles.title}>키즈스케줄</Text>
        <Text style={styles.subtitle}>AI가 아이 스케줄을 관리해드려요</Text>
      </View>

      <TouchableOpacity
        style={styles.roleCard}
        onPress={() => router.push({ pathname: '/(auth)/family-setup', params: { role: 'mom' } })}
      >
        <Text style={styles.roleIcon}>👩‍💼</Text>
        <Text style={styles.roleName}>엄마 (의사결정자)</Text>
        <Text style={styles.roleDesc}>아이 스케줄 관리, 선생님 소통, AI 비서 사용</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.roleCard}
        onPress={() => router.push({ pathname: '/(auth)/family-setup', params: { role: 'caregiver' } })}
      >
        <Text style={styles.roleIcon}>👵</Text>
        <Text style={styles.roleName}>주양육자 (실행자)</Text>
        <Text style={styles.roleDesc}>오늘의 스케줄 확인, 변경 알림 수신</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>엄마가 먼저 가입 후, 주양육자에게 초대 코드를 보내세요</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  logo: { alignItems: 'center', marginTop: 60, marginBottom: 40 },
  icon: { fontSize: 60 },
  title: { fontSize: 24, fontWeight: 'bold', marginTop: 12 },
  subtitle: { fontSize: 14, color: '#888', marginTop: 4 },
  roleCard: {
    borderWidth: 2, borderColor: '#eee', borderRadius: 16, padding: 24,
    marginBottom: 16,
  },
  roleIcon: { fontSize: 32, marginBottom: 8 },
  roleName: { fontSize: 16, fontWeight: 'bold' },
  roleDesc: { fontSize: 13, color: '#888', marginTop: 4 },
  hint: { textAlign: 'center', fontSize: 12, color: '#999', marginTop: 'auto', marginBottom: 20 },
});
