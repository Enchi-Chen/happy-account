import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';

import { colors } from '@/constants/theme';
import { createHappinessRepository } from '@/src/data/schema';
import { createCsvExportFilename, happinessEntriesToCsv } from '@/src/utils/csv';

export default function SettingsScreen() {
  const database = useSQLiteContext();
  const [isExporting, setIsExporting] = useState(false);

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

  return <View style={styles.container}>
    <Text accessibilityRole="header" style={styles.title}>設定</Text>
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>資料備份</Text>
      <Text style={styles.description}>將所有快樂紀錄匯出為 CSV，並透過系統分享或儲存。</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: isExporting }} disabled={isExporting} onPress={() => void exportEntries()} style={({ pressed }) => [styles.exportButton, (pressed || isExporting) && styles.exportButtonPressed]}>
        {isExporting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.exportButtonText}>匯出快樂</Text>}
      </Pressable>
      {isExporting && <Text style={styles.status}>正在準備 CSV…</Text>}
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
  status: { color: colors.muted, fontSize: 14, marginTop: 12, textAlign: 'center' },
});
