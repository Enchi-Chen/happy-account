
//此檔案負責管理資料庫的開啟與初始化時的連線，並提供一個函式來取得資料庫連線物件、重複呼叫時使用既有的Promise，避免重複開啟資料庫
import * as SQLite from 'expo-sqlite';

import { initializeDatabase } from './schema';

export { initializeDatabase } from './schema';

export const DATABASE_NAME = 'happy-account.db';

//SQLite.openDatabaseAsync為實際執行開啟資料庫的操作
//SQLite.SQLiteDatabase 是 Expo SQLite 提供的 TypeScript 型別。它代表一個已經開啟的 SQLite 資料庫物件，可以用來執行database.getAllAsync(...)等操作


let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;//一開始是undefined 呼叫過後才會變成 Promise<SQLite.SQLiteDatabase>，這個 Promise 會在資料庫開啟完成後 resolve，並回傳 SQLite.SQLiteDatabase 物件

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  
  //尚未建立資料庫連線 Promise 時，才會開始新的開啟資料庫操作
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (database) => {
      await initializeDatabase(database);
      return database;
    });
  }

  return databasePromise.catch((error: unknown) => {
    databasePromise = undefined;
    throw error;
  });
}


