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
