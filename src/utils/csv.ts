//匯出csv時的處理規則
import type { HappinessEntry } from '@/src/data/schema';

export const HAPPINESS_CSV_HEADERS = [
  'id',
  'date',
  'time',
  'amount',
  'content',
  'occurred_at_utc',
  'occurred_utc_offset_minutes',
  'created_at',
  'updated_at',
] as const;

/** Escapes one RFC 4180-compatible CSV field while leaving ordinary values readable. */
export function escapeCsvField(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Builds a UTF-8 CSV snapshot. The BOM helps spreadsheet apps recognise Chinese text. */
export function happinessEntriesToCsv(entries: HappinessEntry[]): string {
  const rows = entries.map((entry) => [
    entry.id,
    entry.occurred_local_date,
    entry.occurred_local_time,
    entry.amount,
    entry.content,
    entry.occurred_at_utc,
    entry.occurred_utc_offset_minutes,
    entry.created_at,
    entry.updated_at,
  ].map(escapeCsvField).join(','));

  return `\uFEFF${HAPPINESS_CSV_HEADERS.join(',')}\r\n${rows.join('\r\n')}`;
}

export function createCsvExportFilename(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const localDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const timestamp = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${String(date.getMilliseconds()).padStart(3, '0')}`;
  return `happy-account-${localDate}-${timestamp}.csv`;
}
