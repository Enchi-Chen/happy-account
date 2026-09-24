import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

import { createHappinessOccurrence } from '../src/data/date.ts';
import {
  getDefaultHappinessFormValues,
  validateHappinessForm,
} from '../src/data/happiness-form.ts';
import { getMonthDateRange, moveMonth, parseMonthKey } from '../src/data/month.ts';
import {
  createHappinessRepository,
  DATABASE_SCHEMA_VERSION,
  initializeDatabase,
} from '../src/data/schema.ts';

const SQL = await initSqlJs({
  locateFile: (file) => fileURLToPath(new URL(`../node_modules/sql.js/dist/${file}`, import.meta.url)),
});

function createDatabaseAdapter(serializedDatabase) {
  const database = serializedDatabase ? new SQL.Database(serializedDatabase) : new SQL.Database();

  return {
    async execAsync(source) {
      database.run(source);
    },
    async runAsync(source, params) {
      database.run(source, params);
      const result = database.exec('SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowId;')[0]
        .values[0];
      return { changes: result[0], lastInsertRowId: result[1] };
    },
    async getFirstAsync(source, params) {
      const statement = database.prepare(source);
      try {
        statement.bind(params);
        if (!statement.step()) {
          return null;
        }
        return statement.getAsObject();
      } finally {
        statement.free();
      }
    },
    async getAllAsync(source, params) {
      const statement = database.prepare(source);
      const rows = [];
      try {
        statement.bind(params);
        while (statement.step()) {
          rows.push(statement.getAsObject());
        }
        return rows;
      } finally {
        statement.free();
      }
    },
    export() {
      return database.export();
    },
  };
}

test('initializes version 1 schema without clearing existing entries', async () => {
  const database = createDatabaseAdapter();
  await initializeDatabase(database);

  const version = await database.getFirstAsync('PRAGMA user_version;', []);
  assert.equal(version.user_version, DATABASE_SCHEMA_VERSION);

  const repository = createHappinessRepository(database);
  const created = await repository.create(draftFor('第一筆快樂'));

  await initializeDatabase(database);
  assert.deepEqual(await repository.getById(created.id), created);
});

test('supports create, read, update, ordered reads, and delete', async () => {
  const database = createDatabaseAdapter();
  await initializeDatabase(database);
  const repository = createHappinessRepository(database);

  const earlier = await repository.create(draftFor('早上的咖啡', '2026-01-01', '08:30', 480));
  const later = await repository.create(draftFor('傍晚散步', '2026-01-01', '18:45', 480));

  assert.deepEqual(
    (await repository.getAll()).map((entry) => entry.id),
    [later.id, earlier.id],
  );

  const updated = await repository.update(later.id, draftFor('傍晚散步和晚霞', '2026-01-01', '19:00', 480));
  assert.equal(updated?.content, '傍晚散步和晚霞');
  assert.equal(updated?.amount, 20);

  assert.equal(await repository.remove(earlier.id), true);
  assert.equal(await repository.getById(earlier.id), null);
  assert.equal(await repository.remove(earlier.id), false);
});

test('reads one selected month in descending occurrence order', async () => {
  const database = createDatabaseAdapter();
  await initializeDatabase(database);
  const repository = createHappinessRepository(database);

  const january = await repository.create(draftFor('一月的快樂', '2026-01-31', '23:59', 480));
  const februaryEarly = await repository.create(draftFor('二月早上', '2026-02-01', '08:00', 480));
  const februaryLate = await repository.create(draftFor('二月晚上', '2026-02-01', '20:00', 480));
  const range = getMonthDateRange({ year: 2026, month: 2 });

  assert.deepEqual(
    (await repository.getByLocalDateRange(range.startDate, range.endDate)).map((entry) => entry.id),
    [februaryLate.id, februaryEarly.id],
  );
  assert.notEqual(january.id, februaryLate.id);
});

test('moves an edited entry to its new month, keeps ordering, and persists after reopen', async () => {
  const firstOpen = createDatabaseAdapter();
  await initializeDatabase(firstOpen);
  const repository = createHappinessRepository(firstOpen);
  const edited = await repository.create(draftFor('原本的一月紀錄', '2026-01-10', '09:00', 480));
  const laterFebruary = await repository.create(draftFor('二月晚上', '2026-02-15', '20:00', 480));

  const updated = await repository.update(edited.id, draftFor('修改後的三月紀錄', '2026-03-01', '08:00', 480));
  assert.equal(updated?.content, '修改後的三月紀錄');
  assert.equal((await repository.getByLocalDateRange('2026-01-01', '2026-02-01')).length, 0);
  assert.deepEqual(
    (await repository.getByLocalDateRange('2026-02-01', '2026-04-01')).map((entry) => entry.id),
    [updated?.id, laterFebruary.id],
  );

  const reopened = createDatabaseAdapter(firstOpen.export());
  await initializeDatabase(reopened);
  assert.equal((await createHappinessRepository(reopened).getById(edited.id))?.content, '修改後的三月紀錄');
});

test('parses and moves selected months across year boundaries', () => {
  assert.deepEqual(parseMonthKey('2026-02'), { year: 2026, month: 2 });
  assert.equal(parseMonthKey('2026-13'), null);
  assert.deepEqual(moveMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
  assert.deepEqual(getMonthDateRange({ year: 2026, month: 12 }), {
    startDate: '2026-12-01', endDate: '2027-01-01',
  });
});

test('persists entries after a serialized database is reopened', async () => {
  const firstOpen = createDatabaseAdapter();
  await initializeDatabase(firstOpen);
  const firstRepository = createHappinessRepository(firstOpen);
  const created = await firstRepository.create(draftFor('重新開啟後仍存在'));

  const reopenedDatabase = createDatabaseAdapter(firstOpen.export());
  await initializeDatabase(reopenedDatabase);
  const reopenedRepository = createHappinessRepository(reopenedDatabase);

  assert.deepEqual(await reopenedRepository.getById(created.id), created);
});

test('converts a local date, time, and UTC offset without changing the local date', () => {
  assert.deepEqual(createHappinessOccurrence('2026-02-28', '00:15', 480), {
    occurredAtUtc: '2026-02-27T16:15:00.000Z',
    occurredLocalDate: '2026-02-28',
    occurredLocalTime: '00:15',
    occurredUtcOffsetMinutes: 480,
  });
});

test('validates deposit form values and preserves a backdated local occurrence', () => {
  const valid = validateHappinessForm(
    {
      amountChoice: 'custom',
      customAmount: '100',
      content: '補記：和朋友散步',
      localDate: '2025-12-31',
      localTime: '23:45',
    },
    480,
  );

  assert.equal(valid.valid, true);
  if (valid.valid) {
    assert.equal(valid.draft.amount, 100);
    assert.equal(valid.draft.occurred_local_date, '2025-12-31');
    assert.equal(valid.draft.occurred_at_utc, '2025-12-31T15:45:00.000Z');
  }

  for (const invalidAmount of ['', '0', '-5', '1.5']) {
    assert.equal(
      validateHappinessForm({
        amountChoice: 'custom', customAmount: invalidAmount, content: '一件快樂的事', localDate: '2026-01-01', localTime: '12:00',
      }).valid,
      false,
    );
  }

  assert.equal(
    validateHappinessForm({
      ...getDefaultHappinessFormValues(new Date('2026-01-02T03:04:00')),
      content: '   ',
    }).valid,
    false,
  );
});

function draftFor(content, date = '2026-01-01', time = '12:00', offset = 480) {
  const occurrence = createHappinessOccurrence(date, time, offset);
  return {
    amount: 20,
    content,
    occurred_at_utc: occurrence.occurredAtUtc,
    occurred_local_date: occurrence.occurredLocalDate,
    occurred_local_time: occurrence.occurredLocalTime,
    occurred_utc_offset_minutes: occurrence.occurredUtcOffsetMinutes,
  };
}
