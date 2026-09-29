//此檔案包含了資料庫的schema定義、資料操作方法(各方法使用的SQL語法)、以及資料庫的所有邏輯(如初始化與遷移)。
export const DATABASE_SCHEMA_VERSION = 2;

type SqlValue = string | number | null;
type SqlParameters = SqlValue[];

// 用於資料庫連線物件(如CreateDatabaseRepository)的型別定義，包含了五個expo-sqlite資料操作方法套件
export type DatabaseConnection = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlParameters): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync<T>(source: string, params: SqlParameters): Promise<T | null>;
  getAllAsync<T>(source: string, params: SqlParameters): Promise<T[]>;
  withExclusiveTransactionAsync?: (task: (transaction: DatabaseConnection) => Promise<void>) => Promise<void>;
};

export type HappinessEntry = {
  id: number;
  amount: number;
  content: string;
  occurred_at_utc: string;
  occurred_local_date: string;
  occurred_local_time: string;
  occurred_utc_offset_minutes: number;
  created_at: string;
  updated_at: string;
};

export type HappinessEntryDraft = Omit<HappinessEntry, 'id' | 'created_at' | 'updated_at'>;

export type HappinessAmountRange = {
  min: number;
  max: number | null;
};

export type HappinessEntryPageCursor = Pick<HappinessEntry, 'occurred_at_utc' | 'id'>;

export type HappinessEntryPageQuery = {
  limit: number;
  cursor?: HappinessEntryPageCursor;
  contentQuery?: string;
  amountRanges?: HappinessAmountRange[];
};

export type HappinessStatistics = {
  count: number;
  totalAmount: number;
};

export type DailyHappinessEntryCount = {
  occurred_local_date: string;
  count: number;
  /** Comma-separated entry amounts, retained only to colour calendar dots. */
  amounts: string;
};

export type DriveBackupKind = 'manual' | 'automatic';

/** Non-secret, per-Google-account backup metadata. OAuth credentials are never stored here. */
export type DriveBackupState = {
  account_id: string;
  folder_id: string | null;
  last_successful_backup_at_utc: string | null;
  last_successful_backup_kind: DriveBackupKind | null;
  last_successful_auto_backup_month: string | null;
};

//everytime when the app starts, we check if the database schema is up to date. If not, we apply migrations to bring it up to date.
export async function initializeDatabase(database: DatabaseConnection): Promise<void> {
  await database.execAsync('PRAGMA journal_mode = WAL;');

  const version = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version;', []);
  const currentVersion = version?.user_version ?? 0;

  if (currentVersion > DATABASE_SCHEMA_VERSION) {
    throw new Error('Database schema version is newer than this app supports.');
  }

  if (currentVersion < 1) {
    await applyVersionOneMigration(database);
  }
  if (currentVersion < 2) {
    await applyVersionTwoMigration(database);
  }
}

//這個函式接收一個資料庫連線，並回傳一個包含各種操作方法的物件(日常使用)，由DatabaseConnection提供的五個方法來執行SQL語法組合而成
export function createHappinessRepository(database: DatabaseConnection) {
  const getById = (id: number): Promise<HappinessEntry | null> =>
    database.getFirstAsync<HappinessEntry>('SELECT * FROM happiness_entries WHERE id = ?;', [id]);

  return {
    async create(draft: HappinessEntryDraft): Promise<HappinessEntry> {
      const now = new Date().toISOString();
      const result = await database.runAsync(
        `INSERT INTO happiness_entries (
          amount, content, occurred_at_utc, occurred_local_date, occurred_local_time,
          occurred_utc_offset_minutes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          draft.amount,
          draft.content,
          draft.occurred_at_utc,
          draft.occurred_local_date,
          draft.occurred_local_time,
          draft.occurred_utc_offset_minutes,
          now,
          now,
        ],
      );

      const entry = await getById(result.lastInsertRowId);
      if (!entry) {
        throw new Error('Created happiness entry could not be read.');
      }
      return entry;
    },

    getById,

    getAll(): Promise<HappinessEntry[]> {
      return database.getAllAsync<HappinessEntry>(
        'SELECT * FROM happiness_entries ORDER BY occurred_at_utc DESC, id DESC;',
        [],
      );
    },

    async importEntries(entries: Omit<HappinessEntry, 'id'>[]): Promise<{ importedCount: number; duplicateCount: number }> {
      let importedCount = 0;
      let duplicateCount = 0;

      await runExclusiveTransaction(database, async (transaction) => {
        const existingEntries = await transaction.getAllAsync<HappinessEntry>(
          'SELECT * FROM happiness_entries;',
          [],
        );
        const entryKeys = new Set(existingEntries.map(happinessEntryKey));

        for (const entry of entries) {
          const key = happinessEntryKey(entry);
          if (entryKeys.has(key)) {
            duplicateCount += 1;
            continue;
          }

          await transaction.runAsync(
            `INSERT INTO happiness_entries (
              amount, content, occurred_at_utc, occurred_local_date, occurred_local_time,
              occurred_utc_offset_minutes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              entry.amount,
              entry.content,
              entry.occurred_at_utc,
              entry.occurred_local_date,
              entry.occurred_local_time,
              entry.occurred_utc_offset_minutes,
              entry.created_at,
              entry.updated_at,
            ],
          );
          entryKeys.add(key);
          importedCount += 1;
        }
      });

      return { importedCount, duplicateCount };
    },

    getByLocalDateRange(startDate: string, endDate: string): Promise<HappinessEntry[]> {
      return database.getAllAsync<HappinessEntry>(
        `SELECT * FROM happiness_entries
         WHERE occurred_local_date >= ? AND occurred_local_date < ?
         ORDER BY occurred_at_utc DESC, id DESC;`,
        [startDate, endDate],
      );
    },

    getDailyCountsByLocalDateRange(
      startDate: string,
      endDate: string,
    ): Promise<DailyHappinessEntryCount[]> {
      return database.getAllAsync<DailyHappinessEntryCount>(
        `SELECT occurred_local_date, COUNT(*) AS count, GROUP_CONCAT(amount, ',') AS amounts
         FROM happiness_entries
         WHERE occurred_local_date >= ? AND occurred_local_date < ?
         GROUP BY occurred_local_date
         ORDER BY occurred_local_date ASC;`,
        [startDate, endDate],
      );
    },

    async getStatistics(dateRange?: { startDate: string; endDate: string }): Promise<HappinessStatistics> {
      const result = await database.getFirstAsync<{ count: number; totalAmount: number }>(
        `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS totalAmount
         FROM happiness_entries
         ${dateRange ? 'WHERE occurred_local_date >= ? AND occurred_local_date < ?' : ''};`,
        dateRange ? [dateRange.startDate, dateRange.endDate] : [],
      );
      return { count: Number(result?.count ?? 0), totalAmount: Number(result?.totalAmount ?? 0) };
    },

    /**
     * Reads one stable, newest-first page.  The cursor keeps paging correct even
     * when several entries share exactly the same occurrence timestamp.
     */
    getPage(query: HappinessEntryPageQuery): Promise<HappinessEntry[]> {
      const conditions: string[] = [];
      const params: SqlParameters = [];
      const contentQuery = query.contentQuery?.trim();

      if (contentQuery) {
        conditions.push('content LIKE ? ESCAPE \'\\\'');
        params.push(`%${escapeLikeValue(contentQuery)}%`);
      }

      if (query.amountRanges && query.amountRanges.length > 0) {
        const rangeConditions: string[] = [];
        for (const range of query.amountRanges) {
          if (range.max === null) {
            rangeConditions.push('amount >= ?');
            params.push(range.min);
          } else {
            rangeConditions.push('(amount >= ? AND amount <= ?)');
            params.push(range.min, range.max);
          }
        }
        conditions.push(`(${rangeConditions.join(' OR ')})`);
      }

      if (query.cursor) {
        conditions.push('(occurred_at_utc < ? OR (occurred_at_utc = ? AND id < ?))');
        params.push(query.cursor.occurred_at_utc, query.cursor.occurred_at_utc, query.cursor.id);
      }

      params.push(query.limit);
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      return database.getAllAsync<HappinessEntry>(
        `SELECT * FROM happiness_entries
         ${whereClause}
         ORDER BY occurred_at_utc DESC, id DESC
         LIMIT ?;`,
        params,
      );
    },

    async hasMatchingEntryInMonth(
      startDate: string,
      endDate: string,
      query: Pick<HappinessEntryPageQuery, 'contentQuery' | 'amountRanges'>,
    ): Promise<boolean> {
      // Do the bounded month query directly so navigation does not need to load history first.
      const conditions = ['occurred_local_date >= ?', 'occurred_local_date < ?'];
      const params: SqlParameters = [startDate, endDate];
      const contentQuery = query.contentQuery?.trim();
      if (contentQuery) {
        conditions.push('content LIKE ? ESCAPE \'\\\'');
        params.push(`%${escapeLikeValue(contentQuery)}%`);
      }
      if (query.amountRanges && query.amountRanges.length > 0) {
        const rangeConditions: string[] = [];
        for (const range of query.amountRanges) {
          if (range.max === null) {
            rangeConditions.push('amount >= ?'); params.push(range.min);
          } else {
            rangeConditions.push('(amount >= ? AND amount <= ?)'); params.push(range.min, range.max);
          }
        }
        conditions.push(`(${rangeConditions.join(' OR ')})`);
      }
      return (await database.getFirstAsync<{ id: number }>(
        `SELECT id FROM happiness_entries WHERE ${conditions.join(' AND ')} LIMIT 1;`, params,
      )) !== null;
    },

    async update(id: number, draft: HappinessEntryDraft): Promise<HappinessEntry | null> {
      const result = await database.runAsync(
        `UPDATE happiness_entries
         SET amount = ?, content = ?, occurred_at_utc = ?, occurred_local_date = ?,
             occurred_local_time = ?, occurred_utc_offset_minutes = ?, updated_at = ?
         WHERE id = ?;`,
        [
          draft.amount,
          draft.content,
          draft.occurred_at_utc,
          draft.occurred_local_date,
          draft.occurred_local_time,
          draft.occurred_utc_offset_minutes,
          new Date().toISOString(),
          id,
        ],
      );

      return result.changes === 0 ? null : getById(id);
    },

    async remove(id: number): Promise<boolean> {
      const result = await database.runAsync('DELETE FROM happiness_entries WHERE id = ?;', [id]);
      return result.changes > 0;
    },
  };
}

export function createDriveBackupStateRepository(database: DatabaseConnection) {
  const get = (accountId: string): Promise<DriveBackupState | null> =>
    database.getFirstAsync<DriveBackupState>(
      `SELECT account_id, folder_id, last_successful_backup_at_utc,
              last_successful_backup_kind, last_successful_auto_backup_month
       FROM drive_backup_state WHERE account_id = ?;`,
      [accountId],
    );

  return {
    get,

    async saveFolderId(accountId: string, folderId: string): Promise<DriveBackupState> {
      await database.runAsync(
        `INSERT INTO drive_backup_state (account_id, folder_id)
         VALUES (?, ?)
         ON CONFLICT(account_id) DO UPDATE SET folder_id = excluded.folder_id;`,
        [accountId, folderId],
      );
      const state = await get(accountId);
      if (!state) throw new Error('Drive backup state could not be read after saving its folder.');
      return state;
    },

    async markSuccessful(
      accountId: string,
      kind: DriveBackupKind,
      successfulAtUtc: string,
      automaticMonth?: string,
    ): Promise<DriveBackupState> {
      await database.runAsync(
        `INSERT INTO drive_backup_state (
          account_id, last_successful_backup_at_utc, last_successful_backup_kind,
          last_successful_auto_backup_month
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          last_successful_backup_at_utc = excluded.last_successful_backup_at_utc,
          last_successful_backup_kind = excluded.last_successful_backup_kind,
          last_successful_auto_backup_month = CASE
            WHEN excluded.last_successful_backup_kind = 'automatic'
            THEN excluded.last_successful_auto_backup_month
            ELSE drive_backup_state.last_successful_auto_backup_month
          END;`,
        [accountId, successfulAtUtc, kind, automaticMonth ?? null],
      );
      const state = await get(accountId);
      if (!state) throw new Error('Drive backup state could not be read after saving success.');
      return state;
    },
  };
}

function escapeLikeValue(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function happinessEntryKey(entry: Omit<HappinessEntry, 'id'>): string {
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

async function runExclusiveTransaction(
  database: DatabaseConnection,
  task: (transaction: DatabaseConnection) => Promise<void>,
): Promise<void> {
  if (database.withExclusiveTransactionAsync) {
    await database.withExclusiveTransactionAsync(task);
    return;
  }

  await database.execAsync('BEGIN IMMEDIATE;');
  try {
    await task(database);
    await database.execAsync('COMMIT;');
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }
}

// Applies the first migration to create the initial schema!真正定義資料庫的規格
async function applyVersionOneMigration(database: DatabaseConnection): Promise<void> {
  await database.execAsync('BEGIN IMMEDIATE;');

  try {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS happiness_entries (
        id INTEGER PRIMARY KEY,
        amount INTEGER NOT NULL CHECK (amount > 0),
        content TEXT NOT NULL,
        occurred_at_utc TEXT NOT NULL,
        occurred_local_date TEXT NOT NULL,
        occurred_local_time TEXT NOT NULL,
        occurred_utc_offset_minutes INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_happiness_entries_occurred_at_utc
        ON happiness_entries (occurred_at_utc DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_happiness_entries_occurred_local_date
        ON happiness_entries (occurred_local_date);
      PRAGMA user_version = 1;
      COMMIT;
    `);
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }
}

async function applyVersionTwoMigration(database: DatabaseConnection): Promise<void> {
  await database.execAsync('BEGIN IMMEDIATE;');
  try {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS drive_backup_state (
        account_id TEXT PRIMARY KEY NOT NULL,
        folder_id TEXT,
        last_successful_backup_at_utc TEXT,
        last_successful_backup_kind TEXT CHECK (
          last_successful_backup_kind IS NULL OR last_successful_backup_kind IN ('manual', 'automatic')
        ),
        last_successful_auto_backup_month TEXT
      );
      PRAGMA user_version = 2;
      COMMIT;
    `);
  } catch (error) {
    await database.execAsync('ROLLBACK;');
    throw error;
  }
}
