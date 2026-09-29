//此檔案負責處理日期和時間相關的邏輯，包括解析、格式化和計算。
export type HappinessOccurrence = {
  occurredAtUtc: string;
  occurredLocalDate: string;
  occurredLocalTime: string;
  occurredUtcOffsetMinutes: number;
};

export function getCurrentUtcOffsetMinutes(date: Date): number {
  return -date.getTimezoneOffset();
}

export function createHappinessOccurrence(
  localDate: string,
  localTime: string,
  utcOffsetMinutes: number,
): HappinessOccurrence {
  const dateParts = parseLocalDate(localDate);
  const timeParts = parseLocalTime(localTime);

  if (!Number.isInteger(utcOffsetMinutes) || utcOffsetMinutes < -840 || utcOffsetMinutes > 840) {
    throw new Error('UTC offset must be an integer between -840 and 840 minutes.');
  }

  const utcMilliseconds =
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, timeParts.hour, timeParts.minute) -
    utcOffsetMinutes * 60_000;

  return {
    occurredAtUtc: new Date(utcMilliseconds).toISOString(),
    occurredLocalDate: localDate,
    occurredLocalTime: localTime,
    occurredUtcOffsetMinutes: utcOffsetMinutes,
  };
}

function parseLocalDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error('Local date must use YYYY-MM-DD format.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    throw new Error('Local date is not valid.');
  }

  return { year, month, day };
}

function parseLocalTime(value: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error('Local time must use HH:mm format.');
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) {
    throw new Error('Local time is not valid.');
  }

  return { hour, minute };
}
