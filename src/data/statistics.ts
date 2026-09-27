//此檔案負責處理首頁統計資料的日期範圍計算邏輯(首頁)
export type StatisticsPeriod = 'week' | 'month' | 'year';

export type LocalDateRange = {
  startDate: string;
  endDate: string;
};

export function getStatisticsDateRange(period: StatisticsPeriod, now = new Date()): LocalDateRange {
  const year = now.getFullYear();
  const month = now.getMonth();

  if (period === 'month') {
    return { startDate: formatLocalDate(new Date(year, month, 1)), endDate: formatLocalDate(new Date(year, month + 1, 1)) };
  }
  if (period === 'year') {
    return { startDate: formatLocalDate(new Date(year, 0, 1)), endDate: formatLocalDate(new Date(year + 1, 0, 1)) };
  }

  const startOfToday = new Date(year, month, now.getDate());
  const daysSinceMonday = (startOfToday.getDay() + 6) % 7;
  const startOfWeek = new Date(year, month, now.getDate() - daysSinceMonday);
  const startOfNextWeek = new Date(year, month, now.getDate() - daysSinceMonday + 7);
  return { startDate: formatLocalDate(startOfWeek), endDate: formatLocalDate(startOfNextWeek) };
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
