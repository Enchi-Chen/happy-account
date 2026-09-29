import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';

import { colors } from '@/constants/theme';
import { createDriveBackupStateRepository, createHappinessRepository, type DriveBackupState } from '@/src/data/schema';
import { createCsvExportFilename, happinessEntriesToCsv } from '@/src/utils/csv';
import { CsvImportValidationError, decodeUtf8Csv, parseHappinessCsvImport } from '@/src/utils/csv-import';
import { connectGoogleDrive, getSavedGoogleDriveAccount, GoogleDriveAuthorizationError, type GoogleDriveAccount } from '@/src/services/google-drive-auth';
import { BackupInProgressError, identifyGoogleDriveAccount, runGoogleDriveBackup } from '@/src/services/drive-backup';

export default function SettingsScreen() {
  const database = useSQLiteContext();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [account, setAccount] = useState<GoogleDriveAccount | null>(null);
  const [backupState, setBackupState] = useState<DriveBackupState | null>(null);
  const [needsReauthorization, setNeedsReauthorization] = useState(false);

  const refreshBackupStatus = useCallback(async () => {
    const savedAccount = await getSavedGoogleDriveAccount();
    setAccount(savedAccount);
    setBackupState(savedAccount ? await createDriveBackupStateRepository(database).get(savedAccount.accountId) : null);
  }, [database]);

  useEffect(() => {
    const timer = setTimeout(() => { void refreshBackupStatus(); }, 0);
    return () => clearTimeout(timer);
  }, [refreshBackupStatus]);

  const exportEntries = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const entries = await createHappinessRepository(database).getAll();
      if (entries.length === 0) return Alert.alert('目前沒有可匯出的快樂', '新增快樂紀錄後再匯出 CSV。');
      if (!await Sharing.isAvailableAsync()) return Alert.alert('無法使用分享功能', '這台裝置目前無法開啟系統分享／儲存介面。');
      const file = new File(Paths.cache, createCsvExportFilename());
      file.write(happinessEntriesToCsv(entries));
      await Sharing.shareAsync(file.uri, { dialogTitle: '匯出快樂紀錄', mimeType: 'text/csv' });
      Alert.alert('匯出完成', '已開啟系統分享／儲存介面。');
    } catch { Alert.alert('匯出失敗', '無法匯出快樂紀錄，本機資料沒有變更。'); }
    finally { setIsExporting(false); }
  };

  const importEntries = async () => {
    if (isImporting || isExporting) return;
    setIsImporting(true);
    try {
      const selection = await File.pickFileAsync({ mimeTypes: ['text/csv', 'application/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'] });
      if (selection.canceled) return;
      const parsed = parseHappinessCsvImport(decodeUtf8Csv(await selection.result.bytes()));
      const result = await createHappinessRepository(database).importEntries(parsed.entries);
      Alert.alert('匯入完成', `CSV 共 ${parsed.sourceRowCount} 筆；新增 ${result.importedCount} 筆，略過 ${parsed.duplicateRowCount + result.duplicateCount} 筆重複資料。`);
    } catch (error) {
      if (error instanceof CsvImportValidationError) Alert.alert('CSV 格式錯誤', `${error.message}\n本次沒有匯入任何資料。`);
      else Alert.alert('匯入失敗', '無法匯入 CSV，本機資料沒有變更。');
    } finally { setIsImporting(false); }
  };

  const connect = async () => {
    if (isConnecting || isBackingUp) return;
    setIsConnecting(true);
    try {
      const connected = await connectGoogleDrive(identifyGoogleDriveAccount);
      if (!connected) return;
      setAccount(connected);
      setBackupState(await createDriveBackupStateRepository(database).get(connected.accountId));
      setNeedsReauthorization(false);
      Alert.alert('Google Drive 已連接', connected.email ?? '已辨識 Google 帳號。');
    } catch (error) { Alert.alert('Google Drive 連接失敗', error instanceof Error ? error.message : '請稍後再試。'); }
    finally { setIsConnecting(false); }
  };

  const backupNow = async () => {
    if (isBackingUp || isConnecting) return;
    if (!account) return Alert.alert('尚未連接 Google Drive', '請先連接 Google Drive 再立即備份。');
    setIsBackingUp(true);
    try {
      await runGoogleDriveBackup(database, 'manual', account);
      await refreshBackupStatus();
      Alert.alert('備份完成', '已在 Google Drive 建立一份新的 CSV 備份。');
    } catch (error) {
      if (error instanceof GoogleDriveAuthorizationError) setNeedsReauthorization(true);
      if (!(error instanceof BackupInProgressError)) Alert.alert('備份失敗', error instanceof Error ? error.message : '請檢查網路後重試。');
    } finally { setIsBackingUp(false); }
  };

  const busy = isExporting || isImporting || isConnecting || isBackingUp;
  return <View style={styles.container}>
    <Text accessibilityRole="header" style={styles.title}>設定</Text>
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>本機 CSV</Text>
      <Text style={styles.description}>匯出全部快樂紀錄為 CSV，或匯入先前匯出的 CSV。</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void exportEntries()} style={({ pressed }) => [styles.primaryButton, (pressed || busy) && styles.buttonPressed]}>
        {isExporting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>匯出快樂</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void importEntries()} style={({ pressed }) => [styles.secondaryButton, (pressed || busy) && styles.buttonPressed]}>
        {isImporting ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryButtonText}>匯入 CSV</Text>}
      </Pressable>
    </View>
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Google Drive 雲端備份</Text>
      <Text style={styles.description}>{account ? `${needsReauthorization ? '需要重新連接：' : '已連接：'}${account.email ?? 'Google 帳號'}\n最後備份：${formatBackupTime(backupState?.last_successful_backup_at_utc)}` : '尚未連接 Google Drive。快樂紀錄仍只保存在本機。'}</Text>
      {account && <Text style={styles.accountHint}>備份紀錄屬於目前帳號；重新連接可切換帳號。</Text>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void connect()} style={({ pressed }) => [styles.secondaryButton, (pressed || busy) && styles.buttonPressed]}>
        {isConnecting ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryButtonText}>{account ? '切換帳號／重新授權' : '連接 Google Drive'}</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void backupNow()} style={({ pressed }) => [styles.primaryButton, (pressed || busy) && styles.buttonPressed]}>
        {isBackingUp ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>立即備份</Text>}
      </Pressable>
      {isBackingUp && <Text style={styles.status}>正在建立完整 CSV 備份…</Text>}
    </View>
  </View>;
}

function formatBackupTime(value: string | null | undefined): string {
  if (!value) return '尚未備份';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '尚未備份';
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1, padding: 20 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 24 },
  section: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, marginBottom: 16, padding: 18 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  accountHint: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 10 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 10, justifyContent: 'center', marginTop: 16, minHeight: 48, paddingHorizontal: 16 },
  secondaryButton: { alignItems: 'center', borderColor: colors.primary, borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 12, minHeight: 48, paddingHorizontal: 16 },
  buttonPressed: { opacity: 0.65 },
  primaryButtonText: { color: colors.surface, fontSize: 16, fontWeight: '700' },
  secondaryButtonText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  status: { color: colors.muted, fontSize: 14, marginTop: 12, textAlign: 'center' },
});
