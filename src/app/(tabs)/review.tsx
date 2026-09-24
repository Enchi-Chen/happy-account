import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { HappinessEntryForm } from '@/components/HappinessEntryForm';
import { getHappinessLevelColors } from '@/constants/happiness-levels';
import { colors } from '@/constants/theme';
import { getHappinessFormValues, validateHappinessForm, type HappinessFormValues } from '@/src/data/happiness-form';
import { formatMonthTitle, getCurrentLocalMonth, getMonthDateRange, moveMonth, parseMonthKey, type LocalMonth } from '@/src/data/month';
import { createHappinessRepository, type HappinessEntry } from '@/src/data/schema';

export default function ReviewScreen() {
  const { month: monthParam } = useLocalSearchParams<{ month?: string }>();
  const monthKey = typeof monthParam === 'string' ? monthParam : 'current';
  const initialMonth = parseMonthKey(typeof monthParam === 'string' ? monthParam : undefined);

  return <ReviewList key={monthKey} initialMonth={initialMonth ?? getCurrentLocalMonth()} />;
}

function ReviewList({ initialMonth }: { initialMonth: LocalMonth }) {
  const database = useSQLiteContext();
  const [selectedMonth, setSelectedMonth] = useState<LocalMonth>(initialMonth);
  const [entries, setEntries] = useState<HappinessEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<HappinessEntry | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const range = getMonthDateRange(selectedMonth);
      const results = await createHappinessRepository(database).getByLocalDateRange(range.startDate, range.endDate);
      setEntries(results);
    } catch {
      setError('無法讀取快樂紀錄，請稍後再試。');
    } finally {
      setIsLoading(false);
    }
  }, [database, selectedMonth]);

  useFocusEffect(useCallback(() => { void loadEntries(); }, [loadEntries]));

  const chooseAction = (entry: HappinessEntry) => {
    Alert.alert('這筆快樂', '你想要如何處理這筆紀錄？', [
      { text: '取消', style: 'cancel' },
      { text: '刪除', style: 'destructive', onPress: () => confirmDelete(entry) },
      { text: '編輯', onPress: () => { setEditError(null); setEditingEntry(entry); } },
    ]);
  };

  const confirmDelete = (entry: HappinessEntry) => {
    Alert.alert('刪除這筆快樂？', '刪除後無法復原。', [
      { text: '取消', style: 'cancel' },
      { text: '刪除', style: 'destructive', onPress: () => void deleteEntry(entry) },
    ]);
  };

  const deleteEntry = async (entry: HappinessEntry) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const deleted = await createHappinessRepository(database).remove(entry.id);
      if (!deleted) {
        Alert.alert('無法刪除', '找不到這筆快樂紀錄，可能已被移除。');
        return;
      }
      await loadEntries();
    } catch {
      Alert.alert('無法刪除', '刪除失敗，這筆快樂仍保留在資料庫中。');
    } finally {
      setIsDeleting(false);
    }
  };

  const saveEdit = async (values: HappinessFormValues) => {
    if (!editingEntry || isSavingEdit) return;
    const validation = validateHappinessForm(values);
    if (!validation.valid) {
      setEditError(validation.message);
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);
    try {
      const updated = await createHappinessRepository(database).update(editingEntry.id, validation.draft);
      if (!updated) {
        setEditError('找不到這筆快樂紀錄，可能已被移除。');
        return;
      }
      setEditingEntry(null);
      const updatedMonth = parseMonthKey(updated.occurred_local_date.slice(0, 7));
      if (updatedMonth) setSelectedMonth(updatedMonth);
    } catch {
      setEditError('修改失敗，請稍後再試。你的輸入內容已保留。');
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.monthBar}>
        <MonthButton direction="previous" onPress={() => setSelectedMonth((current) => moveMonth(current, -1))} />
        <Text accessibilityRole="header" style={styles.monthTitle}>{formatMonthTitle(selectedMonth)}</Text>
        <MonthButton direction="next" onPress={() => setSelectedMonth((current) => moveMonth(current, 1))} />
      </View>

      {isLoading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={loadEntries} /> : (
        <FlatList contentContainerStyle={entries.length === 0 ? styles.emptyList : styles.list} data={entries} keyExtractor={(entry) => String(entry.id)} ListEmptyComponent={<Text style={styles.stateText}>這個月份還沒有快樂紀錄。</Text>} renderItem={({ item }) => <HappinessEntryCard entry={item} onPress={() => chooseAction(item)} />} />
      )}

      <Modal animationType="slide" onRequestClose={() => !isSavingEdit && setEditingEntry(null)} transparent visible={editingEntry !== null}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text accessibilityRole="header" style={styles.modalTitle}>編輯快樂</Text>
              <Pressable accessibilityLabel="取消編輯" accessibilityRole="button" disabled={isSavingEdit} onPress={() => setEditingEntry(null)} style={styles.cancelButton}><Text style={styles.cancelButtonText}>取消</Text></Pressable>
            </View>
            {editingEntry && <HappinessEntryForm key={editingEntry.id} error={editError} initialValues={getHappinessFormValues(editingEntry)} isSubmitting={isSavingEdit} onChange={() => setEditError(null)} onSubmit={(values) => void saveEdit(values)} submitLabel="儲存修改" submittingLabel="儲存中…" />}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MonthButton({ direction, onPress }: { direction: 'previous' | 'next'; onPress: () => void }) {
  const isPrevious = direction === 'previous';
  return <Pressable accessibilityLabel={isPrevious ? '上個月' : '下個月'} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}><Text style={styles.monthButtonText}>{isPrevious ? '‹' : '›'}</Text></Pressable>;
}

function HappinessEntryCard({ entry, onPress }: { entry: HappinessEntry; onPress: () => void }) {
  const levelColors = getHappinessLevelColors(entry.amount);
  return <Pressable accessibilityLabel={`快樂紀錄：${entry.content}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: levelColors.backgroundColor }, pressed && styles.pressed]}><View style={styles.cardHeader}><Text style={[styles.amount, { color: levelColors.amountColor }]}>${entry.amount}</Text><Text style={[styles.dateTime, { color: levelColors.timestampColor }]}>{entry.occurred_local_date}　{entry.occurred_local_time}</Text></View><Text style={[styles.content, { color: levelColors.contentColor }]}>{entry.content}</Text></Pressable>;
}

function LoadingState() {
  return <View style={styles.centeredState}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>讀取紀錄中…</Text></View>;
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => Promise<void> }) {
  return <View style={styles.centeredState}><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void onRetry()} style={styles.retryButton}><Text style={styles.retryButtonText}>重新讀取</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1 }, monthBar: { alignItems: 'center', backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 }, monthButton: { alignItems: 'center', borderRadius: 22, justifyContent: 'center', minHeight: 44, minWidth: 44 }, monthButtonText: { color: colors.primary, fontSize: 34, fontWeight: '400', lineHeight: 38 }, monthTitle: { color: colors.text, fontSize: 18, fontWeight: '700' }, list: { gap: 12, padding: 16, paddingBottom: 28 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, padding: 16 }, cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, amount: { color: colors.primary, fontSize: 20, fontWeight: '700' }, content: { color: colors.text, fontSize: 16, lineHeight: 24, marginTop: 10 }, dateTime: { color: colors.muted, fontSize: 14 }, centeredState: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }, emptyList: { flexGrow: 1, justifyContent: 'center', padding: 24 }, stateText: { color: colors.muted, fontSize: 16, lineHeight: 24, textAlign: 'center' }, errorText: { color: '#B42318', fontSize: 16, lineHeight: 24, textAlign: 'center' }, retryButton: { marginTop: 16, padding: 12 }, retryButtonText: { color: colors.primary, fontSize: 16, fontWeight: '700' }, pressed: { opacity: 0.65 }, modalBackdrop: { backgroundColor: 'rgba(0,0,0,0.35)', flex: 1, justifyContent: 'flex-end' }, modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '90%' }, modalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18 }, modalTitle: { color: colors.text, fontSize: 21, fontWeight: '700' }, cancelButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }, cancelButtonText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
});
