import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getHappinessLevelColors } from '@/constants/happiness-levels';
import { colors } from '@/constants/theme';
import { getCalendarMonthGrid, getCurrentLocalMonth, getMonthDateRange, moveMonth, formatMonthTitle, type LocalMonth } from '@/src/data/month';
import { createHappinessRepository, type DailyHappinessEntryCount } from '@/src/data/schema';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MAX_VISIBLE_DOTS = 11;
type CalendarCounts = Record<string, { count: number; amounts: number[] }>;

export default function CalendarScreen() {
  const database = useSQLiteContext();
  const requestId = useRef(0);
  const [month, setMonth] = useState<LocalMonth>(getCurrentLocalMonth);
  const [counts, setCounts] = useState<CalendarCounts>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  const changeMonth = (amount: number) => setMonth((current) => moveMonth(current, amount));

  return <View style={styles.container}>
    <View style={styles.monthBar}><MonthButton direction="previous" onPress={() => changeMonth(-1)} /><Text accessibilityRole="header" style={styles.monthTitle}>{formatMonthTitle(month)}</Text><MonthButton direction="next" onPress={() => changeMonth(1)} /></View>
    {isLoading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={loadMonth} /> : <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.weekdayRow}>{WEEKDAYS.map((weekday) => <Text key={weekday} style={styles.weekday}>{weekday}</Text>)}</View>
      <View style={styles.grid}>{cells.map((cell, index) => <CalendarCell key={cell?.localDate ?? `empty-${index}`} cell={cell} data={cell ? counts[cell.localDate] : undefined} />)}</View>
      {Object.keys(counts).length === 0 && <Text style={styles.emptyText}>這個月還沒有快樂紀錄。</Text>}
    </ScrollView>}
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
function CalendarCell({ cell, data }: { cell: ReturnType<typeof getCalendarMonthGrid>[number]; data?: CalendarCounts[string] }) {
  if (!cell) return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.dayCell, styles.emptyCell]} />;
  const visibleCount = Math.min(data?.count ?? 0, MAX_VISIBLE_DOTS);
  const hasOverflow = (data?.count ?? 0) > MAX_VISIBLE_DOTS;
  return <View accessibilityLabel={`${cell.localDate}${data ? `，${data.count} 筆快樂紀錄` : ''}`} style={styles.dayCell}>
    <Text style={styles.dayNumber}>{cell.day}</Text><View style={styles.dots}>
      {Array.from({ length: visibleCount }, (_, index) => <View key={index} style={[styles.dot, { backgroundColor: getHappinessLevelColors(data?.amounts[index] ?? 1).amountColor }]} />)}
      {hasOverflow && <Text style={styles.plus}>+</Text>}
    </View>
  </View>;
}
function LoadingState() { return <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>正在載入月份紀錄…</Text></View>; }
function ErrorState({ error, onRetry }: { error: string; onRetry: () => Promise<void> }) { return <View style={styles.state}><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void onRetry()} style={styles.retryButton}><Text style={styles.retryText}>重新載入</Text></Pressable></View>; }

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1 }, monthBar: { alignItems: 'center', backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 }, monthButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 }, monthButtonText: { color: colors.primary, fontSize: 36, lineHeight: 40 }, monthTitle: { color: colors.text, fontSize: 19, fontWeight: '700' }, content: { padding: 12, paddingBottom: 28 }, weekdayRow: { flexDirection: 'row', marginBottom: 4 }, weekday: { color: colors.muted, flex: 1, fontSize: 14, fontWeight: '700', textAlign: 'center' }, grid: { borderLeftColor: colors.border, borderLeftWidth: 1, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap' }, dayCell: { backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, borderRightColor: colors.border, borderRightWidth: 1, height: 88, paddingHorizontal: 3, paddingTop: 5, width: '14.285714%' }, emptyCell: { backgroundColor: '#FCF7F1' }, dayNumber: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' }, dots: { alignContent: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginHorizontal: 'auto', marginTop: 5, width: 33 }, dot: { borderRadius: 3, height: 6, margin: 2, width: 6 }, plus: { color: colors.primary, fontSize: 13, fontWeight: '700', height: 10, lineHeight: 11, margin: 1, textAlign: 'center', width: 10 }, emptyText: { color: colors.muted, fontSize: 15, marginTop: 18, textAlign: 'center' }, state: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }, stateText: { color: colors.muted, fontSize: 16, marginTop: 12 }, errorText: { color: '#B42318', fontSize: 16, lineHeight: 24, textAlign: 'center' }, retryButton: { minHeight: 44, justifyContent: 'center', marginTop: 12, paddingHorizontal: 12 }, retryText: { color: colors.primary, fontSize: 16, fontWeight: '700' }, pressed: { opacity: 0.65 },
});
