import { Tabs } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';

export default function TabLayout() {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}>
      <Tabs.Screen name="index" options={{ title: '首頁' }} />
      <Tabs.Screen name="deposit" options={{ title: '存入快樂' }} />
      <Tabs.Screen name="review" options={{ title: '回顧快樂' }} />
      <Tabs.Screen name="calendar" options={{ title: '月曆' }} />
      <Tabs.Screen name="settings" options={{ title: '設定' }} />
    </Tabs>
    </SafeAreaView>
  );
}
