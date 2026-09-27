import assert from 'node:assert/strict';
import test from 'node:test';

import { createCsvExportFilename, escapeCsvField, happinessEntriesToCsv } from '../src/utils/csv.ts';

test('escapes CSV fields containing commas, quotes, and line breaks', () => {
  assert.equal(escapeCsvField('今天很開心'), '今天很開心');
  assert.equal(escapeCsvField('吃了披薩,蛋糕'), '"吃了披薩,蛋糕"');
  assert.equal(escapeCsvField('他說 "今天很好"'), '"他說 ""今天很好"""');
  assert.equal(escapeCsvField('今天完成作業\n晚上和朋友吃飯'), '"今天完成作業\n晚上和朋友吃飯"');
  assert.equal(escapeCsvField('逗號, "引號"\r\n換行 😊'), '"逗號, ""引號""\r\n換行 😊"');
});

test('creates a UTF-8 BOM CSV with preserved happiness entry values', () => {
  const csv = happinessEntriesToCsv([{
    id: 7, amount: 50, content: '今天吃了披薩,蛋糕\n他說 "很好" 😊',
    occurred_at_utc: '2026-09-26T01:02:03.000Z', occurred_local_date: '2026-09-26',
    occurred_local_time: '09:02', occurred_utc_offset_minutes: 480,
    created_at: '2026-09-26T01:02:03.000Z', updated_at: '2026-09-26T02:02:03.000Z',
  }]);

  assert.equal(csv.startsWith('\uFEFFid,date,time,amount,content,'), true);
  assert.match(csv, /7,2026-09-26,09:02,50,"今天吃了披薩,蛋糕\n他說 ""很好"" 😊"/);
});

test('makes same-day export filenames unique to the millisecond', () => {
  assert.equal(createCsvExportFilename(new Date(2026, 8, 26, 9, 2, 3, 4)), 'happy-account-2026-09-26-090203-004.csv');
});
