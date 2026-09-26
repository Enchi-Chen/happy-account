import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, type ViewToken } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { HappinessEntryForm } from '@/components/HappinessEntryForm';
import { MonthPickerModal } from '@/components/MonthPickerModal';
import { getHappinessLevelColors } from '@/constants/happiness-levels';
import { colors } from '@/constants/theme';
import { getHappinessFormValues, validateHappinessForm, type HappinessFormValues } from '@/src/data/happiness-form';
import { formatMonthTitle, getCurrentLocalMonth, getMonthKey, moveMonth, parseMonthKey, type LocalMonth } from '@/src/data/month';
import { createHappinessRepository, type HappinessAmountRange, type HappinessEntry } from '@/src/data/schema';

const PAGE_SIZE = 30;
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 55 };
const FIXED_RANGES: (HappinessAmountRange & { id: string; label: string })[] = [
  { id: '1-9', label: '1–9', min: 1, max: 9 }, { id: '10-19', label: '10–19', min: 10, max: 19 },
  { id: '20-49', label: '20–49', min: 20, max: 49 }, { id: '50-99', label: '50–99', min: 50, max: 99 }, { id: '100+', label: '100 以上', min: 100, max: null },
];

type ReviewRow =
  | { kind: 'month'; key: string; month: LocalMonth }
  | { kind: 'empty'; key: string; month: LocalMonth }
  | { kind: 'entry'; key: string; entry: HappinessEntry };

export default function ReviewScreen() {
  const { month } = useLocalSearchParams<{ month?: string }>();
  const requestedMonth = parseMonthKey(typeof month === 'string' ? month : undefined);
  return <ReviewList key={typeof month === 'string' ? month : 'current'} initialMonth={requestedMonth ?? getCurrentLocalMonth()} requestedMonth={requestedMonth} />;
}

function ReviewList({ initialMonth, requestedMonth }: { initialMonth: LocalMonth; requestedMonth: LocalMonth | null }) {
  const database = useSQLiteContext();
  const listRef = useRef<FlatList<ReviewRow>>(null);
  const requestId = useRef(0);
  const initialMonthJumped = useRef(false);
  const [visibleMonth, setVisibleMonth] = useState(initialMonth);
  const [monthCeiling, setMonthCeiling] = useState(initialMonth);
  const [monthFloor, setMonthFloor] = useState(initialMonth);
  const [entries, setEntries] = useState<HappinessEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedRangeIds, setSelectedRangeIds] = useState(FIXED_RANGES.map((range) => range.id));
  const [customRange, setCustomRange] = useState<HappinessAmountRange | null>(null);
  const [editingEntry, setEditingEntry] = useState<HappinessEntry | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMonthPickerVisible, setIsMonthPickerVisible] = useState(false);

  const amountRanges = useMemo(() => [...FIXED_RANGES.filter((range) => selectedRangeIds.includes(range.id)), ...(customRange ? [customRange] : [])], [customRange, selectedRangeIds]);
  const query = useMemo(() => ({ contentQuery: appliedSearch, amountRanges }), [amountRanges, appliedSearch]);
  const loadFirstPage = useCallback(async () => {
    const id = ++requestId.current; setIsLoading(true); setError(null); setHasMore(true);
    try {
      const results = await createHappinessRepository(database).getPage({ ...query, limit: PAGE_SIZE });
      if (id !== requestId.current) return;
      setEntries(results); setHasMore(results.length === PAGE_SIZE);
      setMonthCeiling(initialMonth); setMonthFloor(initialMonth);
    } catch { if (id === requestId.current) setError('讀取快樂紀錄失敗，請再試一次。'); }
    finally { if (id === requestId.current) setIsLoading(false); }
  }, [database, initialMonth, query]);
  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore || entries.length === 0) return;
    const id = requestId.current; setIsLoadingMore(true);
    try {
      const last = entries[entries.length - 1];
      const results = await createHappinessRepository(database).getPage({ ...query, limit: PAGE_SIZE, cursor: { occurred_at_utc: last.occurred_at_utc, id: last.id } });
      if (id !== requestId.current) return;
      setEntries((current) => { const known = new Set(current.map((entry) => entry.id)); return [...current, ...results.filter((entry) => !known.has(entry.id))]; });
      setHasMore(results.length === PAGE_SIZE);
    } catch { if (id === requestId.current) setError('載入較早紀錄失敗，請再試一次。'); }
    finally { if (id === requestId.current) setIsLoadingMore(false); }
  }, [database, entries, hasMore, isLoading, isLoadingMore, query]);
  useFocusEffect(useCallback(() => { void loadFirstPage(); }, [loadFirstPage]));
  useEffect(() => { const timer = setTimeout(() => setAppliedSearch(searchText), 250); return () => clearTimeout(timer); }, [searchText]);
  const rows = useMemo(() => buildReviewRows(entries, monthCeiling, monthFloor), [entries, monthCeiling, monthFloor]);
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.filter((item) => item.isViewable && item.index !== null && item.item).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0]?.item as ReviewRow | undefined;
    const month = first?.kind === 'entry' ? parseMonthKey(first.entry.occurred_local_date.slice(0, 7)) : first?.month;
    if (month) setVisibleMonth((current) => getMonthKey(current) === getMonthKey(month) ? current : month);
  }, []);
  const scrollToIndex = (index: number) => requestAnimationFrame(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 }));
  const goToMonth = async (target: LocalMonth) => {
    const repository = createHappinessRepository(database);
    const nextCeiling = compareMonths(target, monthCeiling) > 0 ? target : monthCeiling;
    const nextFloor = compareMonths(target, monthFloor) < 0 ? target : monthFloor;
    let combined = entries; let canLoadMore = hasMore;
    while (canLoadMore && (combined.length === 0 || compareMonths(monthFromEntry(combined[combined.length - 1]), target) > 0)) {
      const last = combined[combined.length - 1]; const page = await repository.getPage(last ? { ...query, limit: PAGE_SIZE, cursor: { occurred_at_utc: last.occurred_at_utc, id: last.id } } : { ...query, limit: PAGE_SIZE });
      if (!page.length) { canLoadMore = false; break; } const known = new Set(combined.map((entry) => entry.id)); combined = [...combined, ...page.filter((entry) => !known.has(entry.id))]; if (page.length < PAGE_SIZE) { canLoadMore = false; break; }
    }
    const targetIndex = buildReviewRows(combined, nextCeiling, nextFloor).findIndex((row) => row.kind === 'month' && getMonthKey(row.month) === getMonthKey(target));
    if (combined !== entries) setEntries(combined);
    setHasMore(canLoadMore);
    setMonthCeiling(nextCeiling); setMonthFloor(nextFloor); setVisibleMonth(target);
    if (targetIndex >= 0) scrollToIndex(targetIndex);
  };
  useEffect(() => {
    if (!requestedMonth || isLoading || initialMonthJumped.current) return;
    initialMonthJumped.current = true;
    const timer = setTimeout(() => void goToMonth(requestedMonth), 0);
    return () => clearTimeout(timer);
    // The requested month is immutable for this keyed screen; goToMonth is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length, isLoading, requestedMonth, visibleMonth]);
  const chooseAction = (entry: HappinessEntry) => Alert.alert('管理快樂紀錄', '請選擇要執行的操作。', [{ text: '取消', style: 'cancel' }, { text: '刪除', style: 'destructive', onPress: () => confirmDelete(entry) }, { text: '編輯', onPress: () => { setEditError(null); setEditingEntry(entry); } }]);
  const confirmDelete = (entry: HappinessEntry) => Alert.alert('刪除快樂紀錄？', '刪除後無法復原。', [{ text: '取消', style: 'cancel' }, { text: '刪除', style: 'destructive', onPress: () => void deleteEntry(entry) }]);
  const deleteEntry = async (entry: HappinessEntry) => { if (isDeleting) return; setIsDeleting(true); try { if (!await createHappinessRepository(database).remove(entry.id)) throw new Error(); await loadFirstPage(); } catch { Alert.alert('無法刪除', '刪除快樂紀錄失敗，請稍後再試。'); } finally { setIsDeleting(false); } };
  const saveEdit = async (values: HappinessFormValues) => { if (!editingEntry || isSavingEdit) return; const validation = validateHappinessForm(values); if (!validation.valid) { setEditError(validation.message); return; } setIsSavingEdit(true); setEditError(null); try { if (!await createHappinessRepository(database).update(editingEntry.id, validation.draft)) throw new Error(); setEditingEntry(null); await loadFirstPage(); } catch { setEditError('儲存失敗，請稍後再試。'); } finally { setIsSavingEdit(false); } };

  return <View style={styles.container}>
    <View style={styles.monthBar}><View style={styles.monthNavigation}><MonthButton direction="previous" onPress={() => void goToMonth(moveMonth(visibleMonth, -1))} /><Pressable accessibilityLabel="選擇月份" accessibilityRole="button" onPress={() => setIsMonthPickerVisible(true)} style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}><Text accessibilityRole="header" style={styles.monthTitle}>{formatMonthTitle(visibleMonth)}</Text></Pressable><MonthButton direction="next" onPress={() => void goToMonth(moveMonth(visibleMonth, 1))} /></View><View style={styles.barActions}><Pressable accessibilityLabel="搜尋快樂紀錄" accessibilityRole="button" onPress={() => setSearchOpen((open) => !open)} style={styles.iconButton}><Text style={styles.iconText}>⌕</Text></Pressable><Pressable accessibilityLabel="金額篩選" accessibilityRole="button" onPress={() => setFilterOpen(true)} style={styles.filterButton}><Text style={styles.filterButtonText}>篩選</Text></Pressable></View></View>
    {searchOpen && <View style={styles.searchRow}><TextInput autoFocus clearButtonMode="while-editing" onChangeText={setSearchText} placeholder="搜尋快樂內容" style={styles.searchInput} value={searchText} /><Pressable accessibilityRole="button" onPress={() => setSearchText('')} style={styles.clearSearch}><Text style={styles.clearSearchText}>清除</Text></Pressable></View>}
    {(selectedRangeIds.length !== FIXED_RANGES.length || customRange) && <Text style={styles.appliedText}>已套用金額篩選</Text>}
    {isLoading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={loadFirstPage} /> : <FlatList ref={listRef} data={rows} keyExtractor={(item) => item.key} contentContainerStyle={styles.list} renderItem={({ item }) => <ReviewRowItem row={item} onPress={chooseAction} />} ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.primary} style={styles.footerLoader} /> : null} onEndReached={() => void loadMore()} onEndReachedThreshold={0.5} onViewableItemsChanged={onViewableItemsChanged} viewabilityConfig={VIEWABILITY_CONFIG} onScrollToIndexFailed={({ index }) => setTimeout(() => scrollToIndex(index), 60)} />}
    {isMonthPickerVisible && <MonthPickerModal selectedMonth={visibleMonth} onClose={() => setIsMonthPickerVisible(false)} onSelect={(selectedMonth) => { setIsMonthPickerVisible(false); void goToMonth(selectedMonth); }} />}
    {filterOpen && <FilterModal customRange={customRange} onClose={() => setFilterOpen(false)} onApply={(ids, custom) => { setSelectedRangeIds(ids); setCustomRange(custom); setFilterOpen(false); }} onClear={() => { setSelectedRangeIds(FIXED_RANGES.map((range) => range.id)); setCustomRange(null); setFilterOpen(false); }} selectedIds={selectedRangeIds} />}
    <Modal animationType="slide" onRequestClose={() => !isSavingEdit && setEditingEntry(null)} transparent visible={editingEntry !== null}><View style={styles.modalBackdrop}><View style={styles.modalContent}><View style={styles.modalHeader}><Text accessibilityRole="header" style={styles.modalTitle}>編輯快樂</Text><Pressable accessibilityRole="button" disabled={isSavingEdit} onPress={() => setEditingEntry(null)} style={styles.cancelButton}><Text style={styles.cancelButtonText}>取消</Text></Pressable></View>{editingEntry && <HappinessEntryForm key={editingEntry.id} error={editError} initialValues={getHappinessFormValues(editingEntry)} isSubmitting={isSavingEdit} onChange={() => setEditError(null)} onSubmit={(values) => void saveEdit(values)} submitLabel="儲存變更" submittingLabel="儲存中" />}</View></View></Modal>
  </View>;
}

function FilterModal({ customRange, onApply, onClear, onClose, selectedIds }: { customRange: HappinessAmountRange | null; onApply: (ids: string[], custom: HappinessAmountRange | null) => void; onClear: () => void; onClose: () => void; selectedIds: string[] }) {
  const [ids, setIds] = useState(selectedIds); const [minimum, setMinimum] = useState(customRange ? String(customRange.min) : ''); const [maximum, setMaximum] = useState(customRange?.max === null || !customRange ? '' : String(customRange.max)); const [message, setMessage] = useState<string | null>(null);
  const apply = () => { const hasValue = minimum.trim() !== '' || maximum.trim() !== ''; if (!hasValue) { onApply(ids, null); return; } if (!/^\d+$/.test(minimum) || !/^\d+$/.test(maximum)) { setMessage('自訂區間請輸入最小與最大正整數。'); return; } const min = Number(minimum); const max = Number(maximum); if (min < 1 || max < 1 || min > max) { setMessage('最小值須小於或等於最大值，且兩者都必須大於 0。'); return; } onApply(ids, { min, max }); };
  return <Modal animationType="slide" onRequestClose={onClose} transparent visible><View style={styles.modalBackdrop}><View style={styles.filterContent}><View style={styles.modalHeader}><Text accessibilityRole="header" style={styles.modalTitle}>金額篩選</Text><Pressable accessibilityRole="button" onPress={onClose} style={styles.cancelButton}><Text style={styles.cancelButtonText}>取消</Text></Pressable></View><Text style={styles.filterHint}>可多選；固定區間與自訂區間會合併顯示。</Text><View style={styles.chips}>{FIXED_RANGES.map((range) => <Pressable key={range.id} accessibilityRole="checkbox" accessibilityState={{ checked: ids.includes(range.id) }} onPress={() => setIds((current) => current.includes(range.id) ? current.filter((id) => id !== range.id) : [...current, range.id])} style={[styles.chip, ids.includes(range.id) && styles.chipSelected]}><Text style={[styles.chipText, ids.includes(range.id) && styles.chipTextSelected]}>{range.label}</Text></Pressable>)}</View><Text style={styles.customTitle}>自訂區間</Text><View style={styles.customInputs}><TextInput keyboardType="number-pad" onChangeText={setMinimum} placeholder="最小金額" style={styles.numberInput} value={minimum} /><Text style={styles.rangeDash}>至</Text><TextInput keyboardType="number-pad" onChangeText={setMaximum} placeholder="最大金額" style={styles.numberInput} value={maximum} /></View>{message && <Text style={styles.validationText}>{message}</Text>}<View style={styles.filterActions}><Pressable accessibilityRole="button" onPress={onClear} style={styles.clearFilterButton}><Text style={styles.clearFilterText}>清除篩選</Text></Pressable><Pressable accessibilityRole="button" onPress={apply} style={styles.applyButton}><Text style={styles.applyButtonText}>套用</Text></Pressable></View></View></View></Modal>;
}
function monthFromEntry(entry: HappinessEntry): LocalMonth {
  return { year: Number(entry.occurred_local_date.slice(0, 4)), month: Number(entry.occurred_local_date.slice(5, 7)) };
}
function compareMonths(left: LocalMonth, right: LocalMonth): number { return left.year === right.year ? left.month - right.month : left.year - right.year; }
function buildReviewRows(entries: HappinessEntry[], ceiling: LocalMonth, floor: LocalMonth): ReviewRow[] {
  const newestEntryMonth = entries[0] ? monthFromEntry(entries[0]) : ceiling;
  const oldestEntryMonth = entries[entries.length - 1] ? monthFromEntry(entries[entries.length - 1]) : floor;
  const firstMonth = compareMonths(newestEntryMonth, ceiling) > 0 ? newestEntryMonth : ceiling;
  const lastMonth = compareMonths(oldestEntryMonth, floor) < 0 ? oldestEntryMonth : floor;
  const rows: ReviewRow[] = []; let entryIndex = 0; let month = firstMonth;
  while (compareMonths(month, lastMonth) >= 0) {
    const key = getMonthKey(month); rows.push({ kind: 'month', key: `month-${key}`, month });
    const startIndex = entryIndex;
    while (entries[entryIndex] && entries[entryIndex].occurred_local_date.startsWith(key)) { rows.push({ kind: 'entry', key: `entry-${entries[entryIndex].id}`, entry: entries[entryIndex] }); entryIndex += 1; }
    if (startIndex === entryIndex) rows.push({ kind: 'empty', key: `empty-${key}`, month });
    month = moveMonth(month, -1);
  }
  return rows;
}
function ReviewRowItem({ row, onPress }: { row: ReviewRow; onPress: (entry: HappinessEntry) => void }) {
  if (row.kind === 'month') return <Text accessibilityRole="header" style={styles.listMonthTitle}>{formatMonthTitle(row.month)}</Text>;
  if (row.kind === 'empty') return <Text style={styles.monthEmptyText}>本月沒有紀錄</Text>;
  return <HappinessEntryCard entry={row.entry} onPress={() => onPress(row.entry)} />;
}
function MonthButton({ direction, onPress }: { direction: 'previous' | 'next'; onPress: () => void }) { const previous = direction === 'previous'; return <Pressable accessibilityLabel={previous ? '上一個月' : '下一個月'} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}><Text style={styles.monthButtonText}>{previous ? '‹' : '›'}</Text></Pressable>; }
function HappinessEntryCard({ entry, onPress }: { entry: HappinessEntry; onPress: () => void }) { const levelColors = getHappinessLevelColors(entry.amount); return <Pressable accessibilityLabel={`快樂紀錄：${entry.content}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: levelColors.backgroundColor }, pressed && styles.pressed]}><View style={styles.cardHeader}><Text style={[styles.amount, { color: levelColors.amountColor }]}>${entry.amount}</Text><Text style={[styles.dateTime, { color: levelColors.timestampColor }]}>{entry.occurred_local_date} {getWeekdayLabel(entry.occurred_local_date)}</Text></View><Text style={[styles.content, { color: levelColors.contentColor }]}>{entry.content}</Text></Pressable>; }
function getWeekdayLabel(localDate: string): string { const [year, month, day] = localDate.split('-').map(Number); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(year, month - 1, day).getDay()]; }
function LoadingState() { return <View style={styles.centeredState}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>讀取快樂紀錄中…</Text></View>; }
function ErrorState({ error, onRetry }: { error: string; onRetry: () => Promise<void> }) { return <View style={styles.centeredState}><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void onRetry()} style={styles.retryButton}><Text style={styles.retryButtonText}>再試一次</Text></Pressable></View>; }
const styles = StyleSheet.create({ container: { backgroundColor: colors.background, flex: 1 }, monthBar: { alignItems: 'center', backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8 }, monthNavigation: { alignItems: 'center', flexDirection: 'row' }, barActions: { alignItems: 'center', flexDirection: 'row' }, monthButton: { alignItems: 'center', borderRadius: 22, justifyContent: 'center', minHeight: 44, minWidth: 38 }, monthButtonText: { color: colors.primary, fontSize: 34, lineHeight: 38 }, monthTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginHorizontal: 4 }, listMonthTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 10 }, monthEmptyText: { color: colors.muted, fontSize: 15, paddingBottom: 8 }, iconButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 36 }, iconText: { color: colors.primary, fontSize: 31, lineHeight: 32 }, filterButton: { borderColor: colors.primary, borderRadius: 16, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 }, filterButtonText: { color: colors.primary, fontSize: 13, fontWeight: '700' }, searchRow: { alignItems: 'center', backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', padding: 10 }, searchInput: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.text, flex: 1, minHeight: 42, paddingHorizontal: 12 }, clearSearch: { paddingHorizontal: 10, paddingVertical: 10 }, clearSearchText: { color: colors.primary, fontWeight: '700' }, appliedText: { color: colors.muted, fontSize: 13, paddingHorizontal: 16, paddingTop: 8 }, list: { gap: 12, padding: 16, paddingBottom: 28 }, card: { borderColor: colors.border, borderRadius: 12, borderWidth: 1, padding: 16 }, cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, amount: { fontSize: 20, fontWeight: '700' }, content: { fontSize: 16, lineHeight: 24, marginTop: 10 }, dateTime: { fontSize: 14 }, centeredState: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }, emptyList: { flexGrow: 1, justifyContent: 'center', padding: 24 }, stateText: { color: colors.muted, fontSize: 16, lineHeight: 24, textAlign: 'center' }, errorText: { color: '#B42318', fontSize: 16, lineHeight: 24, textAlign: 'center' }, retryButton: { marginTop: 16, padding: 12 }, retryButtonText: { color: colors.primary, fontSize: 16, fontWeight: '700' }, footerLoader: { marginVertical: 16 }, pressed: { opacity: 0.65 }, modalBackdrop: { backgroundColor: 'rgba(0,0,0,0.35)', flex: 1, justifyContent: 'flex-end' }, modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '90%' }, filterContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28, paddingHorizontal: 20, paddingTop: 8 }, modalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18 }, modalTitle: { color: colors.text, fontSize: 21, fontWeight: '700' }, cancelButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }, cancelButtonText: { color: colors.primary, fontSize: 16, fontWeight: '700' }, filterHint: { color: colors.muted, lineHeight: 20, marginTop: 16 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }, chip: { borderColor: colors.border, borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 }, chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, chipText: { color: colors.text }, chipTextSelected: { color: colors.surface, fontWeight: '700' }, customTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 22 }, customInputs: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 10 }, numberInput: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.text, flex: 1, minHeight: 44, paddingHorizontal: 10 }, rangeDash: { color: colors.muted }, validationText: { color: '#B42318', marginTop: 8 }, filterActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end', marginTop: 24 }, clearFilterButton: { justifyContent: 'center', minHeight: 44, paddingHorizontal: 12 }, clearFilterText: { color: colors.primary, fontWeight: '700' }, applyButton: { backgroundColor: colors.primary, borderRadius: 8, justifyContent: 'center', minHeight: 44, paddingHorizontal: 20 }, applyButtonText: { color: colors.surface, fontWeight: '700' } });
