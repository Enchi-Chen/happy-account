import { createHappinessOccurrence } from '@/src/data/date';
import type { HappinessEntry } from '@/src/data/schema';

import { HAPPINESS_CSV_HEADERS } from './csv';

export type HappinessEntryImport = Omit<HappinessEntry, 'id'>;

export type CsvImportParseResult = {
  entries: HappinessEntryImport[];
  sourceRowCount: number;
  duplicateRowCount: number;
};

export class CsvImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvImportValidationError';
  }
}

/** Decodes selected bytes strictly so malformed UTF-8 never reaches the database. */
export function decodeUtf8Csv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new CsvImportValidationError('CSV 檔案必須使用 UTF-8 編碼。');
  }
}

/** Parses the exact CSV snapshot format emitted by the app and validates every row before import. */
export function parseHappinessCsvImport(csv: string): CsvImportParseResult {
  const rows = parseCsv(csv.startsWith('\uFEFF') ? csv.slice(1) : csv);
  const headers = rows[0];

  if (!headers || headers.length !== HAPPINESS_CSV_HEADERS.length || headers.some((header, index) => header !== HAPPINESS_CSV_HEADERS[index])) {
    throw new CsvImportValidationError(`CSV 標題必須依序為 ${HAPPINESS_CSV_HEADERS.join(',')}。`);
  }

  const sourceIds = new Set<number>();
  const importedKeys = new Set<string>();
  const entries: HappinessEntryImport[] = [];
  let duplicateRowCount = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 1;
    if (row.length !== HAPPINESS_CSV_HEADERS.length) {
      throw new CsvImportValidationError(`第 ${rowNumber} 列欄位數不正確。`);
    }

    const [id, date, time, amount, content, occurredAtUtc, offset, createdAt, updatedAt] = row;
    const sourceId = parsePositiveSafeInteger(id, rowNumber, 'id');
    if (sourceIds.has(sourceId)) {
      throw new CsvImportValidationError(`第 ${rowNumber} 列的 id 與檔案內其他紀錄重複。`);
    }
    sourceIds.add(sourceId);

    const entry: HappinessEntryImport = {
      amount: parsePositiveSafeInteger(amount, rowNumber, 'amount'),
      content: validateContent(content, rowNumber),
      occurred_at_utc: validateUtcIso(occurredAtUtc, rowNumber, 'occurred_at_utc'),
      occurred_local_date: normalizeLocalDate(date, rowNumber),
      occurred_local_time: normalizeLocalTime(time, rowNumber),
      occurred_utc_offset_minutes: parseUtcOffset(offset, rowNumber),
      created_at: validateUtcIso(createdAt, rowNumber, 'created_at'),
      updated_at: validateUtcIso(updatedAt, rowNumber, 'updated_at'),
    };

    validateOccurrence(entry, rowNumber);
    if (entry.created_at > entry.updated_at) {
      throw new CsvImportValidationError(`第 ${rowNumber} 列的 created_at 不得晚於 updated_at。`);
    }

    const key = happinessImportEntryKey(entry);
    if (importedKeys.has(key)) {
      duplicateRowCount += 1;
      continue;
    }
    importedKeys.add(key);
    entries.push(entry);
  }

  return { entries, sourceRowCount: rows.length - 1, duplicateRowCount };
}

/** A stable key for the eight fields that define import de-duplication. */
export function happinessImportEntryKey(entry: HappinessEntryImport): string {
  return JSON.stringify([
    entry.occurred_local_date,
    entry.occurred_local_time,
    entry.amount,
    entry.content,
    entry.occurred_at_utc,
    entry.occurred_utc_offset_minutes,
    entry.created_at,
    entry.updated_at,
  ]);
}

function validateOccurrence(entry: HappinessEntryImport, rowNumber: number): void {
  try {
    const occurrence = createHappinessOccurrence(
      entry.occurred_local_date,
      entry.occurred_local_time,
      entry.occurred_utc_offset_minutes,
    );
    if (occurrence.occurredAtUtc !== entry.occurred_at_utc) {
      throw new Error('mismatch');
    }
  } catch {
    throw new CsvImportValidationError(`第 ${rowNumber} 列的日期、時間、UTC offset 或 occurred_at_utc 不一致。`);
  }
}

/**
 * Excel commonly rewrites `YYYY-MM-DD` to `YYYY/M/D` or `M/D/YYYY` when it saves CSV files.
 * Accept those explicit representations, then persist the app's canonical date format.
 */
function normalizeLocalDate(value: string, rowNumber: number): string {
  const yearFirst = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
  if (yearFirst) {
    return `${yearFirst[1]}-${yearFirst[2].padStart(2, '0')}-${yearFirst[3].padStart(2, '0')}`;
  }

  const monthFirst = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (monthFirst) {
    return `${monthFirst[3]}-${monthFirst[1].padStart(2, '0')}-${monthFirst[2].padStart(2, '0')}`;
  }

  throw new CsvImportValidationError(`第 ${rowNumber} 列的 date 必須是有效日期。`);
}

/**
 * Excel commonly removes the leading hour zero or appends `:00` seconds.
 * The app stores minute precision, so only zero seconds can be normalised.
 */
function normalizeLocalTime(value: string, rowNumber: number): string {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match || (match[3] !== undefined && match[3] !== '00')) {
    throw new CsvImportValidationError(`第 ${rowNumber} 列的 time 必須是有效的 HH:mm 時間。`);
  }
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function parsePositiveSafeInteger(value: string, rowNumber: number, field: string): number {
  if (!/^\d+$/.test(value)) {
    throw new CsvImportValidationError(`第 ${rowNumber} 列的 ${field} 必須是正整數。`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CsvImportValidationError(`第 ${rowNumber} 列的 ${field} 必須是可安全儲存的正整數。`);
  }
  return parsed;
}

function parseUtcOffset(value: string, rowNumber: number): number {
  if (!/^-?\d+$/.test(value)) {
    throw new CsvImportValidationError(`第 ${rowNumber} 列的 occurred_utc_offset_minutes 必須是整數。`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < -840 || parsed > 840) {
    throw new CsvImportValidationError(`第 ${rowNumber} 列的 occurred_utc_offset_minutes 必須介於 -840 與 840。`);
  }
  return parsed;
}

function validateContent(value: string, rowNumber: number): string {
  if (!value.trim()) {
    throw new CsvImportValidationError(`第 ${rowNumber} 列的 content 不可空白。`);
  }
  return value;
}

function validateUtcIso(value: string, rowNumber: number, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new CsvImportValidationError(`第 ${rowNumber} 列的 ${field} 必須是 UTC ISO 8601 格式。`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new CsvImportValidationError(`第 ${rowNumber} 列的 ${field} 不是有效時間。`);
  }
  return value;
}

function parseCsv(source: string): string[][] {
  if (source.length === 0) {
    throw new CsvImportValidationError('CSV 檔案不可為空白。');
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let fieldStarted = false;
  let quoted = false;
  let quoteClosed = false;
  let sourceLine = 1;
  let quotedFieldLine = 1;

  const finishField = () => {
    row.push(field);
    field = '';
    fieldStarted = false;
    quoteClosed = false;
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          quoteClosed = true;
        }
      } else {
        field += character;
        if (character === '\n') sourceLine += 1;
      }
      continue;
    }

    if (quoteClosed) {
      if (character === ',') {
        finishField();
      } else if (character === '\n') {
        finishRow();
        sourceLine += 1;
      } else if (character === '\r' && source[index + 1] === '\n') {
        finishRow();
        index += 1;
        sourceLine += 1;
      } else {
        throw new CsvImportValidationError(`第 ${sourceLine} 列的 CSV 引號結構不正確。`);
      }
      continue;
    }

    if (character === ',') {
      finishField();
    } else if (character === '\n') {
      finishRow();
      sourceLine += 1;
    } else if (character === '\r' && source[index + 1] === '\n') {
      finishRow();
      index += 1;
      sourceLine += 1;
    } else if (character === '\r') {
      throw new CsvImportValidationError(`第 ${sourceLine} 列的 CSV 必須使用 LF 或 CRLF 換行。`);
    } else if (character === '"') {
      if (fieldStarted) {
        throw new CsvImportValidationError(`第 ${sourceLine} 列的 CSV 引號結構不正確。`);
      }
      quoted = true;
      fieldStarted = true;
      quotedFieldLine = sourceLine;
    } else {
      field += character;
      fieldStarted = true;
    }
  }

  if (quoted) {
    throw new CsvImportValidationError(`第 ${quotedFieldLine} 列的 CSV 有未結束的引號。`);
  }
  if (fieldStarted || row.length > 0 || field.length > 0 || quoteClosed) {
    finishRow();
  }
  return rows;
}
