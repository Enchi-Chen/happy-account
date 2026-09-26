import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getHappinessLevelColors } from '@/constants/happiness-levels';
import { HappinessEntryCard } from '@/components/HappinessEntryCard';
import { HappinessEntryForm } from '@/components/HappinessEntryForm';
import { MonthPickerModal } from '@/components/MonthPickerModal';
import { colors } from '@/constants/theme';
import { getHappinessFormValues, validateHappinessForm, type HappinessFormValues } from '@/src/data/happiness-form';
import { getCalendarMonthGrid, getCurrentLocalMonth, getLocalDateRange, getMonthDateRange, moveMonth, formatMonthTitle, type LocalMonth } from '@/src/data/month';
import { createHappinessRepository, type DailyHappinessEntryCount, type HappinessEntry } from '@/src/data/schema';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MAX_VISIBLE_DOTS = 11;
type CalendarCounts = Record<string, { count: number; amounts: number[] }>;

export default function CalendarScreen() {
  const database = useSQLiteContext();
  const requestId = useRef(0);
  const dayRequestId = useRef(0);
  const [month, setMonth] = useState<LocalMonth>(getCurrentLocalMonth);
  const [counts, setCounts] = useState<CalendarCounts>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMonthPickerVisible, setIsMonthPickerVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayEntries, setDayEntries] = useState<HappinessEntry[]>([]);
  const [isDayLoading, setIsDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<HappinessEntry | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const loadMonth = useCallback(async () => {
    const id = ++requestId.current; setIsLoading(true); setError(null);
    try {
      const range = getMonthDateRange(month);
      const rows = await createHappinessRepository(database).getDailyCountsByLocalDateRange(range.startDate, range.endDate);
      if (id !== requestId.current) return;
      setCounts(toCalendarCounts(rows));
    } catch {
      if (id === requestId.current) setError('無法讀取這個月的快樂紀錄，請再試一次。');
    } finally { if (id === requestId.current) setIsLoading(false); }
  }, [database, month]);
  // Match the existing tabs' focus-driven refresh after edits in another screen.
  useFocusEffect(useCallback(() => { void loadMonth(); }, [loadMonth]));
  const cells = useMemo(() => getCalendarMonthGrid(month), [month]);
  const changeMonth = useCallback((amount: number) => setMonth((current) => moveMonth(current, amount)), []);
  const swipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx <= -50) changeMonth(1);
      if (gesture.dx >= 50) changeMonth(-1);
    },
  }), [changeMonth]);
  const loadDay = async (localDate: string) => {
    const id = ++dayRequestId.current; setIsDayLoading(true); setDayError(null);
    try {
      const range = getLocalDateRange(localDate);
      const entries = await createHappinessRepository(database).getByLocalDateRange(range.startDate, range.endDate);
      if (id === dayRequestId.current) setDayEntries(entries);
    } catch {
      if (id === dayRequestId.current) setDayError('無法讀取當日快樂紀錄，請再試一次。');
    } finally { if (id === dayRequestId.current) setIsDayLoading(false); }
  };
  const openDay = (localDate: string) => { setSelectedDate(localDate); void loadDay(localDate); };
  const closeDay = () => { dayRequestId.current += 1; setEditingEntry(null); setSelectedDate(null); };
  const chooseEntryAction = (entry: HappinessEntry) => Alert.alert('管理快樂紀錄', '請選擇要執行的操作。', [{ text: '取消', style: 'cancel' }, { text: '刪除', style: 'destructive', onPress: () => confirmDelete(entry) }, { text: '編輯', onPress: () => { setEditError(null); setEditingEntry(entry); } }]);
  const confirmDelete = (entry: HappinessEntry) => Alert.alert('刪除快樂紀錄？', '刪除後無法復原。', [{ text: '取消', style: 'cancel' }, { text: '刪除', style: 'destructive', onPress: () => void deleteEntry(entry) }]);
  const deleteEntry = async (entry: HappinessEntry) => { if (isDeleting) return; setIsDeleting(true); try { if (!await createHappinessRepository(database).remove(entry.id)) throw new Error(); await Promise.all([loadMonth(), selectedDate ? loadDay(selectedDate) : Promise.resolve()]); } catch { Alert.alert('無法刪除', '刪除快樂紀錄失敗，請稍後再試。'); } finally { setIsDeleting(false); } };
  const saveEdit = async (values: HappinessFormValues) => { if (!editingEntry || isSavingEdit) return; const validation = validateHappinessForm(values); if (!validation.valid) { setEditError(validation.message); return; } setIsSavingEdit(true); setEditError(null); try { if (!await createHappinessRepository(database).update(editingEntry.id, validation.draft)) throw new Error(); setEditingEntry(null); await Promise.all([loadMonth(), selectedDate ? loadDay(selectedDate) : Promise.resolve()]); } catch { setEditError('儲存失敗，請稍後再試。'); } finally { setIsSavingEdit(false); } };

  return <View {...swipeResponder.panHandlers} style={styles.container}>
    <View style={styles.monthBar}><MonthButton direction="previous" onPress={() => changeMonth(-1)} /><Pressable accessibilityLabel="選擇月份" accessibilityRole="button" onPress={() => setIsMonthPickerVisible(true)} style={({ pressed }) => [styles.monthTitleButton, pressed && styles.pressed]}><Text accessibilityRole="header" style={styles.monthTitle}>{formatMonthTitle(month)}</Text></Pressable><MonthButton direction="next" onPress={() => changeMonth(1)} /></View>
    {isLoading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={loadMonth} /> : <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.weekdayRow}>{WEEKDAYS.map((weekday) => <Text key={weekday} style={styles.weekday}>{weekday}</Text>)}</View>
      <View style={styles.grid}>{cells.map((cell, index) => <CalendarCell key={cell?.localDate ?? `empty-${index}`} cell={cell} data={cell ? counts[cell.localDate] : undefined} onPress={openDay} />)}</View>
      {Object.keys(counts).length === 0 && <Text style={styles.emptyText}>這個月還沒有快樂紀錄。</Text>}
    </ScrollView>}
    {isMonthPickerVisible && <MonthPickerModal selectedMonth={month} onClose={() => setIsMonthPickerVisible(false)} onSelect={(selectedMonth) => { setMonth(selectedMonth); setIsMonthPickerVisible(false); }} />}
    {selectedDate && <Modal animationType="slide" onRequestClose={closeDay} transparent visible><View style={dayModalStyles.backdrop}><View style={dayModalStyles.sheet}><View style={dayModalStyles.header}><Text accessibilityRole="header" style={dayModalStyles.title}>{selectedDate} 的快樂紀錄</Text><Pressable accessibilityRole="button" onPress={closeDay} style={dayModalStyles.closeButton}><Text style={dayModalStyles.closeText}>關閉</Text></Pressable></View>{isDayLoading ? <View style={dayModalStyles.state}><ActivityIndicator color={colors.primary} /></View> : dayError ? <View style={dayModalStyles.state}><Text style={styles.errorText}>{dayError}</Text><Pressable accessibilityRole="button" onPress={() => void loadDay(selectedDate)} style={styles.retryButton}><Text style={styles.retryText}>重新載入</Text></Pressable></View> : dayEntries.length === 0 ? <View style={dayModalStyles.state}><Text style={styles.emptyText}>這一天沒有快樂紀錄。</Text></View> : <FlatList contentContainerStyle={dayModalStyles.list} data={dayEntries} keyExtractor={(entry) => String(entry.id)} renderItem={({ item }) => <HappinessEntryCard entry={item} onPress={() => chooseEntryAction(item)} />} />}</View></View></Modal>}
    <Modal animationType="slide" onRequestClose={() => !isSavingEdit && setEditingEntry(null)} transparent visible={editingEntry !== null}><View style={dayModalStyles.backdrop}><View style={dayModalStyles.editSheet}><View style={dayModalStyles.header}><Text accessibilityRole="header" style={dayModalStyles.title}>編輯快樂</Text><Pressable accessibilityRole="button" disabled={isSavingEdit} onPress={() => setEditingEntry(null)} style={dayModalStyles.closeButton}><Text style={dayModalStyles.closeText}>取消</Text></Pressable></View>{editingEntry && <HappinessEntryForm key={editingEntry.id} error={editError} initialValues={getHappinessFormValues(editingEntry)} isSubmitting={isSavingEdit} onChange={() => setEditError(null)} onSubmit={(values) => void saveEdit(values)} submitLabel="儲存變更" submittingLabel="儲存中" />}</View></View></Modal>
  </View>;
}

function toCalendarCounts(rows: DailyHappinessEntryCount[]): CalendarCounts {
  return rows.reduce<CalendarCounts>((result, row) => {
    result[row.occurred_local_date] = { count: Number(row.count), amounts: row.amounts.split(',').map(Number).filter(Number.isFinite) };
    return result;
  }, {});
}
function MonthButton({ direction, onPress }: { direction: 'previous' | 'next'; onPress: () => void }) {
  const previous = direction === 'previous';
  return <Pressable accessibilityLabel={previous ? '上一個月' : '下一個月'} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}><Text style={styles.monthButtonText}>{previous ? '‹' : '›'}</Text></Pressable>;
}
function CalendarCell({ cell, data, onPress }: { cell: ReturnType<typeof getCalendarMonthGrid>[number]; data?: CalendarCounts[string]; onPress: (localDate: string) => void }) {
  if (!cell) return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.dayCell, styles.emptyCell]} />;
  const visibleCount = Math.min(data?.count ?? 0, MAX_VISIBLE_DOTS);
  const hasOverflow = (data?.count ?? 0) > MAX_VISIBLE_DOTS;
  return <Pressable accessibilityLabel={`${cell.localDate}${data ? `，${data.count} 筆快樂紀錄` : ''}`} accessibilityRole="button" onPress={() => onPress(cell.localDate)} style={({ pressed }) => [styles.dayCell, pressed && styles.pressed]}>
    <Text style={styles.dayNumber}>{cell.day}</Text><View style={styles.dots}>
      {Array.from({ length: visibleCount }, (_, index) => <View key={index} style={[styles.dot, { backgroundColor: getHappinessLevelColors(data?.amounts[index] ?? 1).amountColor }]} />)}
      {hasOverflow && <Text style={styles.plus}>+</Text>}
    </View>
  </Pressable>;
}

const dayModalStyles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.35)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '80%' },
  editSheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '90%' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  closeButton: { justifyContent: 'center', minHeight: 44, paddingHorizontal: 6 },
  closeText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  list: { gap: 12, padding: 16, paddingBottom: 28 },
  state: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
});
function LoadingState() { return <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>正在載入月份紀錄…</Text></View>; }
function ErrorState({ error, onRetry }: { error: string; onRetry: () => Promise<void> }) { return <View style={styles.state}><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void onRetry()} style={styles.retryButton}><Text style={styles.retryText}>重新載入</Text></Pressable></View>; }

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1 }, monthBar: { alignItems: 'center', backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 }, monthButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 }, monthButtonText: { color: colors.primary, fontSize: 36, lineHeight: 40 }, monthTitleButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 12 }, monthTitle: { color: colors.text, fontSize: 19, fontWeight: '700' }, content: { padding: 12, paddingBottom: 28 }, weekdayRow: { flexDirection: 'row', marginBottom: 4 }, weekday: { color: colors.muted, flex: 1, fontSize: 14, fontWeight: '700', textAlign: 'center' }, grid: { borderLeftColor: colors.border, borderLeftWidth: 1, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap' }, dayCell: { backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, borderRightColor: colors.border, borderRightWidth: 1, height: 88, paddingHorizontal: 3, paddingTop: 5, width: '14.285714%' }, emptyCell: { backgroundColor: '#FCF7F1' }, dayNumber: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' }, dots: { alignContent: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginHorizontal: 'auto', marginTop: 5, width: 33 }, dot: { borderRadius: 3, height: 6, margin: 2, width: 6 }, plus: { color: colors.primary, fontSize: 13, fontWeight: '700', height: 10, lineHeight: 11, margin: 1, textAlign: 'center', width: 10 }, emptyText: { color: colors.muted, fontSize: 15, marginTop: 18, textAlign: 'center' }, state: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }, stateText: { color: colors.muted, fontSize: 16, marginTop: 12 }, errorText: { color: '#B42318', fontSize: 16, lineHeight: 24, textAlign: 'center' }, retryButton: { minHeight: 44, justifyContent: 'center', marginTop: 12, paddingHorizontal: 12 }, retryText: { color: colors.primary, fontSize: 16, fontWeight: '700' }, pressed: { opacity: 0.65 },
});
