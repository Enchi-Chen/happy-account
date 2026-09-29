import 'react-native-reanimated';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DATABASE_NAME, initializeDatabase } from '../data/database';
import { DriveAutoBackupBootstrap } from '../services/drive-auto-backup-bootstrap';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={initializeDatabase}>
        <DriveAutoBackupBootstrap />
        <Stack screenOptions={{ headerShown: false }} />
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
