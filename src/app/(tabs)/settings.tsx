import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';

import { colors } from '@/constants/theme';
import { createHappinessRepository } from '@/src/data/schema';
import { createCsvExportFilename, happinessEntriesToCsv } from '@/src/utils/csv';
import { CsvImportValidationError, decodeUtf8Csv, parseHappinessCsvImport } from '@/src/utils/csv-import';

export default function SettingsScreen() {
  const database = useSQLiteContext();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const exportEntries = async () => {
    if (isExporting) return;

    setIsExporting(true);
    try {
      const entries = await createHappinessRepository(database).getAll();
      if (entries.length === 0) {
        Alert.alert('沒有可匯出的快樂', '目前沒有可匯出的快樂。');
        return;
      }

      if (!await Sharing.isAvailableAsync()) {
        Alert.alert('無法開啟分享', '這台裝置目前無法使用系統分享或儲存功能。');
        return;
      }

      const file = new File(Paths.cache, createCsvExportFilename());
      file.write(happinessEntriesToCsv(entries));
      await Sharing.shareAsync(file.uri, {
        dialogTitle: '匯出快樂紀錄',
        mimeType: 'text/csv',
      });
      Alert.alert('分享選單已開啟', '請選擇要儲存或分享 CSV 的方式。');
    } catch {
      Alert.alert('匯出失敗', '無法匯出快樂紀錄，請稍後再試。原有紀錄沒有被修改。');
    } finally {
      setIsExporting(false);
    }
  };

  const importEntries = async () => {
    if (isImporting || isExporting) return;

    setIsImporting(true);
    try {
      const selection = await File.pickFileAsync({
        mimeTypes: ['text/csv', 'application/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'],
      });
      if (selection.canceled) return;

      const parsed = parseHappinessCsvImport(decodeUtf8Csv(await selection.result.bytes()));
      const result = await createHappinessRepository(database).importEntries(parsed.entries);
      const duplicateCount = parsed.duplicateRowCount + result.duplicateCount;
      Alert.alert(
        '匯入完成',
        `CSV 共 ${parsed.sourceRowCount} 筆紀錄，新增 ${result.importedCount} 筆，略過 ${duplicateCount} 筆重複紀錄。`,
      );
    } catch (error) {
      if (error instanceof CsvImportValidationError) {
        Alert.alert('CSV 格式錯誤', `${error.message}\n本次沒有新增任何紀錄。`);
      } else {
        Alert.alert('匯入失敗', '無法讀取或寫入 CSV。原有紀錄沒有被修改，本次沒有新增任何紀錄。');
      }
    } finally {
      setIsImporting(false);
    }
  };

  return <View style={styles.container}>
    <Text accessibilityRole="header" style={styles.title}>設定</Text>
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>資料備份</Text>
      <Text style={styles.description}>將所有快樂紀錄匯出為 CSV，並透過系統分享或儲存。</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: isExporting || isImporting }} disabled={isExporting || isImporting} onPress={() => void exportEntries()} style={({ pressed }) => [styles.exportButton, (pressed || isExporting || isImporting) && styles.exportButtonPressed]}>
        {isExporting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.exportButtonText}>匯出快樂</Text>}
      </Pressable>
      {isExporting && <Text style={styles.status}>正在準備 CSV…</Text>}
      <View style={styles.importDivider} />
      <Text style={styles.description}>選擇符合快樂帳戶匯出格式的 CSV，僅新增尚未存在的紀錄。</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: isImporting || isExporting }} disabled={isImporting || isExporting} onPress={() => void importEntries()} style={({ pressed }) => [styles.importButton, (pressed || isImporting || isExporting) && styles.exportButtonPressed]}>
        {isImporting ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.importButtonText}>匯入 CSV</Text>}
      </Pressable>
      {isImporting && <Text style={styles.status}>正在驗證並匯入 CSV…</Text>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1, padding: 20 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 24 },
  section: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 18 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  exportButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 10, justifyContent: 'center', marginTop: 20, minHeight: 48, paddingHorizontal: 16 },
  exportButtonPressed: { opacity: 0.65 },
  exportButtonText: { color: colors.surface, fontSize: 16, fontWeight: '700' },
  importDivider: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 24, paddingTop: 4 },
  importButton: { alignItems: 'center', borderColor: colors.primary, borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 20, minHeight: 48, paddingHorizontal: 16 },
  importButtonText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  status: { color: colors.muted, fontSize: 14, marginTop: 12, textAlign: 'center' },
});
