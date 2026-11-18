import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';

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
      <Tabs.Screen name="index" options={{ title: '首頁', tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="deposit" options={{ title: '存入快樂', tabBarIcon: ({ color, size }) => <Feather name="plus" size={size} color={color} /> }} />
      <Tabs.Screen name="review" options={{ title: '回顧快樂', tabBarIcon: ({ color, size }) => <Feather name="heart" size={size} color={color} /> }} />
      <Tabs.Screen name="calendar" options={{ title: '月曆', tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: '設定', tabBarIcon: ({ color, size }) => <Feather name="settings" size={size} color={color} /> }} />
    </Tabs>
    </SafeAreaView>
  );
}
