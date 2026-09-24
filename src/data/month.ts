export type LocalMonth = {
  year: number;
  month: number;
};

export function getCurrentLocalMonth(now = new Date()): LocalMonth {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function getMonthKey(month: LocalMonth): string {
  return `${month.year}-${String(month.month).padStart(2, '0')}`;
}

export function parseMonthKey(value: string | undefined): LocalMonth | null {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return null;
  }

  return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) };
}

export function moveMonth(month: LocalMonth, amount: number): LocalMonth {
  const date = new Date(month.year, month.month - 1 + amount, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function getMonthDateRange(month: LocalMonth): { startDate: string; endDate: string } {
  const startDate = getMonthKey(month);
  return { startDate: `${startDate}-01`, endDate: `${getMonthKey(moveMonth(month, 1))}-01` };
}

export function formatMonthTitle(month: LocalMonth): string {
  return `${month.year} 年 ${month.month} 月`;
}
