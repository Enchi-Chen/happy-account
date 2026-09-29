import {
  createDriveBackupStateRepository,
  createHappinessRepository,
  type DatabaseConnection,
  type DriveBackupKind,
} from '@/src/data/schema';
import { happinessEntriesToCsv } from '@/src/utils/csv';
import {
  getGoogleDriveAccessToken,
  getSavedGoogleDriveAccount,
  type GoogleDriveAccount,
} from './google-drive-auth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const BACKUP_FOLDER_NAME = 'Happy Account Backups';

export class BackupInProgressError extends Error {}
export class DriveBackupError extends Error {}

let backupInProgress = false;
const attemptedAutomaticBackups = new Set<string>();

type DriveAbout = { user?: { permissionId?: string; emailAddress?: string } };
type DriveFile = { id?: string; mimeType?: string; trashed?: boolean };

export async function identifyGoogleDriveAccount(accessToken: string): Promise<GoogleDriveAccount> {
  const about = await driveJson<DriveAbout>(accessToken, '/about?fields=user(permissionId,emailAddress)');
  const accountId = about.user?.permissionId;
  if (!accountId) throw new DriveBackupError('Google Drive 無法識別目前帳號，未建立連接。');
  return { accountId, email: about.user?.emailAddress ?? null };
}

export async function runGoogleDriveBackup(
  database: DatabaseConnection,
  kind: DriveBackupKind,
  account?: GoogleDriveAccount,
): Promise<{ fileId: string; account: GoogleDriveAccount }> {
  if (backupInProgress) throw new BackupInProgressError('已有備份正在進行，請稍候。');
  backupInProgress = true;
  try {
    const connectedAccount = account ?? await getSavedGoogleDriveAccount();
    if (!connectedAccount) throw new DriveBackupError('尚未連接 Google Drive，請先連接。');

    const startedAt = new Date();
    const accessToken = await getGoogleDriveAccessToken();
    const states = createDriveBackupStateRepository(database);
    const state = await states.get(connectedAccount.accountId);
    const folderId = await ensureBackupFolder(accessToken, state?.folder_id ?? null, async (newFolderId) => {
      // A new folder is not usable for a recorded backup until its ID is safely persisted.
      await states.saveFolderId(connectedAccount.accountId, newFolderId);
    });

    // One complete repository read is the CSV snapshot; it is independent of UI filters and months.
    const csv = happinessEntriesToCsv(await createHappinessRepository(database).getAll());
    const fileId = await uploadCsv(accessToken, folderId, createBackupFilename(startedAt), csv);

    try {
      await states.markSuccessful(
        connectedAccount.accountId,
        kind,
        new Date().toISOString(),
        kind === 'automatic' ? localMonthKey(startedAt) : undefined,
      );
    } catch {
      throw new DriveBackupError('CSV 已上傳，但本機成功狀態未能確認；可稍後重試。');
    }
    return { fileId, account: connectedAccount };
  } finally {
    backupInProgress = false;
  }
}

/** Does not launch OAuth. It is safe to call at startup and silently skips disconnected accounts. */
export async function tryAutomaticMonthlyGoogleDriveBackup(
  database: DatabaseConnection,
  foregroundSession: number,
): Promise<void> {
  const account = await getSavedGoogleDriveAccount();
  if (!account) return;
  const month = localMonthKey(new Date());
  const attemptKey = `${foregroundSession}:${account.accountId}:${month}`;
  if (attemptedAutomaticBackups.has(attemptKey)) return;
  attemptedAutomaticBackups.add(attemptKey);

  const state = await createDriveBackupStateRepository(database).get(account.accountId);
  if (state?.last_successful_auto_backup_month === month) return;
  try {
    await runGoogleDriveBackup(database, 'automatic', account);
  } catch {
    // Automatic backup is intentionally quiet. Settings exposes the connection and retry controls.
  }
}

async function ensureBackupFolder(
  accessToken: string,
  storedFolderId: string | null,
  persistNewFolder: (folderId: string) => Promise<void>,
): Promise<string> {
  if (storedFolderId) {
    const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(storedFolderId)}?fields=id,mimeType,trashed`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const folder = await response.json() as DriveFile;
      if (folder.id && folder.mimeType === 'application/vnd.google-apps.folder' && !folder.trashed) return folder.id;
      // A reachable non-folder or trashed file is confirmed unusable and can be replaced.
    } else if (response.status !== 404) {
      throw await driveHttpError(response, '無法驗證 Google Drive 備份資料夾');
    }
  }

  const folder = await driveJson<DriveFile>(accessToken, '/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: BACKUP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  if (!folder.id) throw new DriveBackupError('Google Drive 建立備份資料夾後沒有回傳資料夾 ID。');
  await persistNewFolder(folder.id);
  return folder.id;
}

async function uploadCsv(accessToken: string, folderId: string, name: string, csv: string): Promise<string> {
  const boundary = `happy-account-${Math.random().toString(16).slice(2)}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name, mimeType: 'text/csv', parents: [folderId] }),
    `--${boundary}`,
    'Content-Type: text/csv; charset=UTF-8',
    '',
    csv,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!response.ok) throw await driveHttpError(response, 'Google Drive CSV 上傳失敗');
  const uploaded = await response.json() as DriveFile;
  if (!uploaded.id) throw new DriveBackupError('Google Drive 上傳完成後沒有回傳檔案 ID。');
  return uploaded.id;
}

async function driveJson<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${DRIVE_API}${path}`, { ...init, headers });
  if (!response.ok) throw await driveHttpError(response, 'Google Drive API 請求失敗');
  return response.json() as Promise<T>;
}

async function driveHttpError(response: Response, prefix: string): Promise<DriveBackupError> {
  let detail = '';
  try {
    const payload = await response.json() as { error?: { message?: string } };
    detail = payload.error?.message ? `：${payload.error.message}` : '';
  } catch { /* preserve the HTTP status below */ }
  return new DriveBackupError(`${prefix}（HTTP ${response.status}）${detail}`);
}

function localMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function createBackupFilename(date: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  const randomHex = Math.floor(Math.random() * 0x1000000).toString(16).toUpperCase().padStart(6, '0');
  return `happy-account-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}-${randomHex}.csv`;
}
