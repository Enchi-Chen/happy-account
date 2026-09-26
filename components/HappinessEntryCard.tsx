import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getHappinessLevelColors } from '@/constants/happiness-levels';
import { colors } from '@/constants/theme';
import type { HappinessEntry } from '@/src/data/schema';

type HappinessEntryCardProps = {
  entry: HappinessEntry;
  onPress: () => void;
};

/** Shared entry card used by the full review list and selected-calendar-day modal. */
export function HappinessEntryCard({ entry, onPress }: HappinessEntryCardProps) {
  const levelColors = getHappinessLevelColors(entry.amount);
  return <Pressable accessibilityLabel={`快樂紀錄：${entry.content}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: levelColors.backgroundColor }, pressed && styles.pressed]}>
    <View style={styles.cardHeader}><Text style={[styles.amount, { color: levelColors.amountColor }]}>${entry.amount}</Text><Text style={[styles.dateTime, { color: levelColors.timestampColor }]}>{entry.occurred_local_date} {getWeekdayLabel(entry.occurred_local_date)}</Text></View>
    <Text style={[styles.content, { color: levelColors.contentColor }]}>{entry.content}</Text>
  </Pressable>;
}

function getWeekdayLabel(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(year, month - 1, day).getDay()];
}

const styles = StyleSheet.create({
  card: { borderColor: colors.border, borderRadius: 12, borderWidth: 1, padding: 16 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  amount: { fontSize: 20, fontWeight: '700' },
  content: { fontSize: 16, lineHeight: 24, marginTop: 10 },
  dateTime: { fontSize: 14 },
  pressed: { opacity: 0.65 },
});
