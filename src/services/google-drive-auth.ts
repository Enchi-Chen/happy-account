import * as SecureStore from 'expo-secure-store';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const ACCESS_TOKEN_KEY = 'happy-account.google-drive.access-token.v1';
const CONNECTED_ACCOUNT_KEY = 'happy-account.google-drive.account.v1';

export type GoogleDriveAccount = {
  accountId: string;
  email: string | null;
};

export class GoogleDriveAuthorizationError extends Error {}

let configured = false;

function ensureNativeGoogleSignIn(): void {
  if (Platform.OS === 'web') {
    throw new GoogleDriveAuthorizationError('Google Drive backup is available in the Android app, not the web preview.');
  }
  if (!configured) {
    GoogleSignin.configure({ scopes: [GOOGLE_DRIVE_FILE_SCOPE] });
    configured = true;
  }
}

async function saveAccount(account: GoogleDriveAccount): Promise<void> {
  await SecureStore.setItemAsync(CONNECTED_ACCOUNT_KEY, JSON.stringify(account));
}

export async function getSavedGoogleDriveAccount(): Promise<GoogleDriveAccount | null> {
  const raw = await SecureStore.getItemAsync(CONNECTED_ACCOUNT_KEY);
  if (!raw) return null;
  try {
    const account = JSON.parse(raw) as GoogleDriveAccount;
    return typeof account.accountId === 'string' ? account : null;
  } catch {
    await SecureStore.deleteItemAsync(CONNECTED_ACCOUNT_KEY);
    return null;
  }
}

/** Gets a fresh token from Google Play services and only then updates the encrypted cache. */
export async function getGoogleDriveAccessToken(): Promise<string> {
  ensureNativeGoogleSignIn();
  try {
    const tokens = await GoogleSignin.getTokens();
    if (!tokens.accessToken) throw new Error('Google did not return an access token.');
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
    return tokens.accessToken;
  } catch {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    throw new GoogleDriveAuthorizationError('Google 授權已失效，請重新連接 Google Drive。');
  }
}

/** Opens the native account chooser and asks only for Drive files created by this app. */
export async function connectGoogleDrive(
  identifyAccount: (accessToken: string) => Promise<GoogleDriveAccount>,
): Promise<GoogleDriveAccount | null> {
  ensureNativeGoogleSignIn();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signOut();
    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') return null;
    const accessToken = await getGoogleDriveAccessToken();
    const account = await identifyAccount(accessToken);
    if (!account.accountId) throw new Error('Google Drive did not return an account identifier.');
    await saveAccount(account);
    return account;
  } catch (error) {
    if (error instanceof GoogleDriveAuthorizationError) throw error;
    throw new GoogleDriveAuthorizationError(
      error instanceof Error ? `無法完成 Google 連接：${error.message}` : '無法完成 Google 連接。',
    );
  }
}

/** Leaves SQLite backup history intact, but removes locally cached credentials and account selection. */
export async function clearGoogleDriveConnection(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(CONNECTED_ACCOUNT_KEY),
  ]);
  if (Platform.OS !== 'web') {
    ensureNativeGoogleSignIn();
    await GoogleSignin.signOut();
  }
}
