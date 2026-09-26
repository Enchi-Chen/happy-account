import { useMemo, useRef } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';
import { formatMonthTitle, getMonthKey, moveMonth, type LocalMonth } from '@/src/data/month';

const MONTH_RADIUS = 300;
const ROW_HEIGHT = 52;

type MonthPickerModalProps = {
  selectedMonth: LocalMonth;
  onClose: () => void;
  onSelect: (month: LocalMonth) => void;
};

/** Dependency-free, vertically scrollable month selection shared by month views. */
export function MonthPickerModal({ selectedMonth, onClose, onSelect }: MonthPickerModalProps) {
  const listRef = useRef<FlatList<LocalMonth>>(null);
  const months = useMemo(
    () => Array.from({ length: MONTH_RADIUS * 2 + 1 }, (_, index) => moveMonth(selectedMonth, MONTH_RADIUS - index)),
    [selectedMonth],
  );

  return <Modal animationType="slide" onRequestClose={onClose} transparent visible>
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>選擇月份</Text>
          <Pressable accessibilityLabel="關閉月份選擇" accessibilityRole="button" onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>關閉</Text></Pressable>
        </View>
        <FlatList
          ref={listRef}
          data={months}
          getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
          initialNumToRender={15}
          initialScrollIndex={MONTH_RADIUS}
          keyExtractor={getMonthKey}
          onScrollToIndexFailed={() => requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: MONTH_RADIUS, animated: false }))}
          renderItem={({ item }) => {
            const selected = getMonthKey(item) === getMonthKey(selectedMonth);
            return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onSelect(item)} style={({ pressed }) => [styles.row, selected && styles.selectedRow, pressed && styles.pressed]}><Text style={[styles.rowText, selected && styles.selectedRowText]}>{formatMonthTitle(item)}</Text></Pressable>;
          }}
          showsVerticalScrollIndicator
          style={styles.list}
        />
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.35)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 20 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  closeButton: { justifyContent: 'center', minHeight: 44, paddingHorizontal: 6 },
  closeText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  list: { marginTop: 8 },
  row: { alignItems: 'center', height: ROW_HEIGHT, justifyContent: 'center', marginHorizontal: 20 },
  selectedRow: { backgroundColor: colors.primary, borderRadius: 10 },
  rowText: { color: colors.text, fontSize: 17, fontWeight: '600' },
  selectedRowText: { color: colors.surface },
  pressed: { opacity: 0.65 },
});
