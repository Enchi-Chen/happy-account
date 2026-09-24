import { createHappinessOccurrence, getCurrentUtcOffsetMinutes } from './date';
import type { HappinessEntryDraft } from './schema';

export const PRESET_AMOUNTS = [5, 10, 20, 50, 100] as const;

export type HappinessFormValues = {
  amountChoice: number | 'custom';
  customAmount: string;
  content: string;
  localDate: string;
  localTime: string;
};

export type HappinessFormValidation =
  | { valid: true; draft: HappinessEntryDraft }
  | { valid: false; message: string };

export function getDefaultHappinessFormValues(now = new Date()): HappinessFormValues {
  const localDate = formatLocalDate(now);
  const localTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  return {
    amountChoice: 5,
    customAmount: '',
    content: '',
    localDate,
    localTime,
  };
}

export function validateHappinessForm(
  values: HappinessFormValues,
  offsetMinutes = getCurrentUtcOffsetMinutes(new Date()),
): HappinessFormValidation {
  const amountValue = values.amountChoice === 'custom' ? values.customAmount.trim() : String(values.amountChoice);

  if (!/^\d+$/.test(amountValue) || Number(amountValue) <= 0) {
    return { valid: false, message: '請輸入有效的正整數金額。' };
  }

  const amount = Number(amountValue);
  if (!Number.isSafeInteger(amount)) {
    return { valid: false, message: '金額超出可儲存範圍。' };
  }

  if (!values.content.trim()) {
    return { valid: false, message: '請寫下至少一件讓你感到快樂的事。' };
  }

  try {
    const occurrence = createHappinessOccurrence(values.localDate, values.localTime, offsetMinutes);
    return {
      valid: true,
      draft: {
        amount,
        content: values.content,
        occurred_at_utc: occurrence.occurredAtUtc,
        occurred_local_date: occurrence.occurredLocalDate,
        occurred_local_time: occurrence.occurredLocalTime,
        occurred_utc_offset_minutes: occurrence.occurredUtcOffsetMinutes,
      },
    };
  } catch {
    return { valid: false, message: '請確認日期為 YYYY-MM-DD、時間為 HH:mm，且內容有效。' };
  }
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
