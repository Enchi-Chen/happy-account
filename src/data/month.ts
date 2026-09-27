//製作月曆用的月曆格子，我們使用週日為第一天，六週的格子，這樣每個日曆列都有相同的高度。這意味著月份的第一天可能不在格子的第一個單元格中，而月份的最後一天可能不在格子的最後一個單元格中。不是當前月份的單元格會填入null值。
export type LocalMonth = {
  year: number;
  month: number;
};

export function getCurrentLocalMonth(now = new Date()): LocalMonth {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export type CalendarDay = {
  day: number;
  localDate: string;
};

/** Returns a Sunday-first, six-week grid so every calendar row has equal height. */
export function getCalendarMonthGrid(month: LocalMonth): (CalendarDay | null)[] {
  const firstWeekday = new Date(month.year, month.month - 1, 1).getDay();
  const daysInMonth = new Date(month.year, month.month, 0).getDate();
  const cells: (CalendarDay | null)[] = Array<CalendarDay | null>(42).fill(null);
  const key = getMonthKey(month);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells[firstWeekday + day - 1] = {
      day,
      localDate: `${key}-${String(day).padStart(2, '0')}`,
    };
  }

  return cells;
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

export function getLocalDateRange(localDate: string): { startDate: string; endDate: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) throw new Error('Local date must use YYYY-MM-DD format.');
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime()) || formatLocalDate(date) !== localDate) throw new Error('Local date is not valid.');
  date.setDate(date.getDate() + 1);
  return { startDate: localDate, endDate: formatLocalDate(date) };
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatMonthTitle(month: LocalMonth): string {
  return `${month.year} 年 ${month.month} 月`;
}
