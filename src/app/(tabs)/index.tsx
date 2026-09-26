import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { colors } from '@/constants/theme';
import { createHappinessRepository, type HappinessStatistics } from '@/src/data/schema';
import { getStatisticsDateRange, type StatisticsPeriod } from '@/src/data/statistics';

const PERIODS: { id: StatisticsPeriod; label: string }[] = [
  { id: 'week', label: '本週' },
  { id: 'month', label: '本月' },
  { id: 'year', label: '本年' },
];

const EMPTY_STATISTICS: HappinessStatistics = { count: 0, totalAmount: 0 };

export default function HomeScreen() {
  const database = useSQLiteContext();
  const [period, setPeriod] = useState<StatisticsPeriod>('week');
  const [history, setHistory] = useState<HappinessStatistics>(EMPTY_STATISTICS);
  const [selected, setSelected] = useState<HappinessStatistics>(EMPTY_STATISTICS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatistics = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const repository = createHappinessRepository(database);
      const [allTime, currentPeriod] = await Promise.all([
        repository.getStatistics(), repository.getStatistics(getStatisticsDateRange(period)),
      ]);
      setHistory(allTime); setSelected(currentPeriod);
    } catch {
      setError('讀取統計資料失敗，請再試一次。');
    } finally {
      setIsLoading(false);
    }
  }, [database, period]);

  useFocusEffect(useCallback(() => { void loadStatistics(); }, [loadStatistics]));

  return <ScrollView contentContainerStyle={styles.container}>
    <Text accessibilityRole="header" style={styles.title}>快樂帳戶</Text>
    <Text style={styles.subtitle}>隨時隨地儲存快樂與感恩！</Text>
    {isLoading ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>讀取統計中…</Text></View> : error ? <View style={styles.state}><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void loadStatistics()} style={styles.retryButton}><Text style={styles.retryText}>再試一次</Text></Pressable></View> : <>
      <StatisticsCard label="歷史累積" statistics={history} />
      <View style={styles.periodSection}><Text accessibilityRole="header" style={styles.sectionTitle}>期間統計</Text><StatisticsCard label={PERIODS.find((item) => item.id === period)?.label ?? ''} statistics={selected} /><View style={styles.periodTabs}>{PERIODS.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: period === item.id }} onPress={() => setPeriod(item.id)} style={[styles.periodTab, period === item.id && styles.periodTabSelected]}><Text style={[styles.periodTabText, period === item.id && styles.periodTabTextSelected]}>{item.label}</Text></Pressable>)}</View></View>
      {history.count === 0 && <Text style={styles.emptyText}>還沒有快樂紀錄，存入第一筆快樂吧！</Text>}
    </>}
    <View accessibilityLabel="靜態硬幣容器" style={styles.coinContainer}><Text style={styles.coinText}>● ● ●</Text><Text style={styles.coinCaption}>快樂累積中</Text></View>
  </ScrollView>;
}

function StatisticsCard({ label, statistics }: { label: string; statistics: HappinessStatistics }) {
  return <View style={styles.statisticsCard}><Text style={styles.cardTitle}>{label}</Text><View style={styles.metricRow}><Metric label="快樂數量" value={String(statistics.count)} /><Metric label="快樂金額" value={`$${statistics.totalAmount}`} /></View></View>;
}
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flexGrow: 1, padding: 20, paddingBottom: 50 }, title: { color: colors.text, fontSize: 26, fontWeight: '700',textAlign: 'center' }, subtitle: { color: colors.muted, fontSize: 16, marginTop: 6,textAlign: 'center' }, coinContainer: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, marginTop: 'auto', paddingVertical: 18 }, coinText: { color: colors.primary, fontSize: 28, letterSpacing: 6 }, coinCaption: { color: colors.muted, fontSize: 13, marginTop: 6 }, statisticsCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginTop: 16, padding: 16 }, cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700' }, metricRow: { flexDirection: 'row', marginTop: 14 }, metric: { flex: 1 }, metricLabel: { color: colors.muted, fontSize: 14 }, metricValue: { color: colors.primary, fontSize: 25, fontWeight: '700', marginTop: 4 }, periodSection: { marginTop: 22 }, sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '700',textAlign:'center' }, periodTabs: { flexDirection: 'row', gap: 8, marginTop: 12 }, periodTab: { borderColor: colors.border, borderRadius: 18, borderWidth: 1, flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center' }, periodTabSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, periodTabText: { color: colors.text, fontWeight: '700' }, periodTabTextSelected: { color: colors.surface }, state: { alignItems: 'center', flex: 1, justifyContent: 'center' }, stateText: { color: colors.muted, marginTop: 10 }, errorText: { color: '#B42318', textAlign: 'center' }, retryButton: { marginTop: 12, padding: 10 }, retryText: { color: colors.primary, fontWeight: '700' }, emptyText: { color: colors.muted, lineHeight: 22, marginTop: 18, textAlign: 'center' },

});
