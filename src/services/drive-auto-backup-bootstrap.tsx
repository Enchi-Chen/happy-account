import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { tryAutomaticMonthlyGoogleDriveBackup } from './drive-backup';

/** Runs after SQLite is ready; it never opens an OAuth UI or blocks the app. */
export function DriveAutoBackupBootstrap() {
  const database = useSQLiteContext();
  const foregroundSession = useRef(1);

  useEffect(() => {
    const check = () => void tryAutomaticMonthlyGoogleDriveBackup(database, foregroundSession.current);
    check();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        foregroundSession.current += 1;
        check();
      }
    });
    return () => subscription.remove();
  }, [database]);

  return null;
}
