import assert from 'node:assert/strict';
import test from 'node:test';

import { happinessEntriesToCsv } from '../src/utils/csv.ts';
import {
  CsvImportValidationError,
  decodeUtf8Csv,
  parseHappinessCsvImport,
} from '../src/utils/csv-import.ts';

const entry = {
  id: 42,
  amount: 50,
  content: '和朋友吃了披薩,蛋糕\n他說 "今天很好" 😊',
  occurred_at_utc: '2026-09-26T01:02:00.000Z',
  occurred_local_date: '2026-09-26',
  occurred_local_time: '09:02',
  occurred_utc_offset_minutes: 480,
  created_at: '2026-09-26T01:02:00.000Z',
  updated_at: '2026-09-26T02:02:00.000Z',
};

test('parses the exported CSV format and preserves all import fields except the source id', () => {
  const parsed = parseHappinessCsvImport(happinessEntriesToCsv([entry]));

  assert.equal(parsed.sourceRowCount, 1);
  assert.deepEqual(parsed.entries, [{
    amount: entry.amount,
    content: entry.content,
    occurred_at_utc: entry.occurred_at_utc,
    occurred_local_date: entry.occurred_local_date,
    occurred_local_time: entry.occurred_local_time,
    occurred_utc_offset_minutes: entry.occurred_utc_offset_minutes,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  }]);
});

test('accepts a header-only CSV and skips identical rows within one file', () => {
  const headerOnly = 'id,date,time,amount,content,occurred_at_utc,occurred_utc_offset_minutes,created_at,updated_at\n';
  assert.deepEqual(parseHappinessCsvImport(headerOnly), { entries: [], sourceRowCount: 0, duplicateRowCount: 0 });

  const duplicated = `${happinessEntriesToCsv([entry])}\r\n${happinessEntriesToCsv([{ ...entry, id: 43 }]).split('\r\n')[1]}`;
  const parsed = parseHappinessCsvImport(duplicated);
  assert.equal(parsed.sourceRowCount, 2);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.duplicateRowCount, 1);
});

test('normalizes Excel-saved local date and time values before validating the UTC occurrence', () => {
  const excelSavedCsv = happinessEntriesToCsv([entry])
    .replace('42,2026-09-26,09:02,50,', '42,9/26/2026,9:02:00,50,');
  const [parsed] = parseHappinessCsvImport(excelSavedCsv).entries;

  assert.equal(parsed.occurred_local_date, '2026-09-26');
  assert.equal(parsed.occurred_local_time, '09:02');
  assert.equal(parsed.occurred_at_utc, '2026-09-26T01:02:00.000Z');
});

test('rejects malformed CSV, invalid row values, duplicate source ids, and invalid UTF-8', () => {
  assert.throws(
    () => parseHappinessCsvImport('id,date,time,amount\n1,2026-01-01,12:00,5'),
    CsvImportValidationError,
  );
  assert.throws(
    () => parseHappinessCsvImport('id,date,time,amount,content,occurred_at_utc,occurred_utc_offset_minutes,created_at,updated_at\n1,2026-02-30,12:00,5,內容,2026-03-02T04:00:00.000Z,480,2026-03-02T04:00:00.000Z,2026-03-02T04:00:00.000Z'),
    /第 2 列/,
  );
  assert.throws(
    () => parseHappinessCsvImport(`${happinessEntriesToCsv([entry])}\r\n${happinessEntriesToCsv([{ ...entry, content: '不同內容' }]).split('\r\n')[1]}`),
    /id 與檔案內其他紀錄重複/,
  );
  assert.throws(() => decodeUtf8Csv(new Uint8Array([0xc3, 0x28])), CsvImportValidationError);
});
