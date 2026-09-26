export const DATABASE_SCHEMA_VERSION = 1;

type SqlValue = string | number | null;
type SqlParameters = SqlValue[];

export type DatabaseConnection = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlParameters): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync<T>(source: string, params: SqlParameters): Promise<T | null>;
  getAllAsync<T>(source: string, params: SqlParameters): Promise<T[]>;
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
}

//這個函式接收一個資料庫連線，並回傳一個包含五個資料操作方法的物件(日常使用)
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

    getByLocalDateRange(startDate: string, endDate: string): Promise<HappinessEntry[]> {
      return database.getAllAsync<HappinessEntry>(
        `SELECT * FROM happiness_entries
         WHERE occurred_local_date >= ? AND occurred_local_date < ?
         ORDER BY occurred_at_utc DESC, id DESC;`,
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

function escapeLikeValue(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

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
