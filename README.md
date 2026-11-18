# Happy Account

Happy Account is a local-first gratitude journal that turns everyday moments of happiness into symbolic deposits. Record what made you happy, assign it a positive "amount," and look back on how those moments accumulate over time.

The app is built with Expo and React Native. Its interface is currently available in Traditional Chinese, and its core features work offline without an account or backend service.


## Features

- Record a happy moment with a preset or custom amount, a note, and a date and time.
- View all-time, weekly, monthly, and yearly totals.
- Browse entries chronologically with month navigation and pagination.
- Search entry text and filter by one or more amount ranges.
- Edit or delete existing entries.
- Explore a monthly calendar with daily entry indicators.
- Export all entries as a UTF-8 CSV file.
- Import a previously exported CSV with full-file validation, duplicate detection, and transactional writes.
- Optionally create manual and monthly Google Drive CSV backups on Android.
- Keep the main experience offline with SQLite as the single source of truth.

## Tech Stack

- [Expo](https://expo.dev/) and [React Native](https://reactnative.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Expo Router](https://docs.expo.dev/router/introduction/) for file-based navigation
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/) for local persistence
- Google Sign-In and Google Drive API for optional cloud backups
- Node's test runner, `tsx`, and `sql.js` for automated tests

## Getting Started

### Prerequisites

- Node.js and npm
- An Android emulator or physical Android device for the primary supported workflow
- Android Studio and the Android SDK for local native builds

### Installation

```bash
git clone <your-repository-url>
cd happy-account
npm install
```

Start the Expo development server:

```bash
npm start
```

To build and run the native Android app locally:

```bash
npm run android
```

You can also launch the web preview with:

```bash
npm run web
```

The web build is useful for previewing the interface, but native-only capabilities such as Google Drive backup are unavailable there. Because Google Sign-In uses a native module, use an Expo development build or an installed APK to test the complete Android experience; Expo Go alone is not sufficient.

## Google Drive Backup Setup

Google Drive backup is optional and does not affect local recording, browsing, or CSV import/export. To enable it for your own Android build:

1. Create or select a Google Cloud project.
2. Enable the Google Drive API.
3. Configure the OAuth consent screen.
4. Create an Android OAuth client for package name `com.happyaccount.app`.
5. Add the SHA fingerprint of the certificate used to sign your development or release build.
6. Rebuild the native Android app after completing the OAuth configuration.

The app requests the limited `drive.file` scope and creates backups in a visible `Happy Account Backups` folder. Each backup is a new CSV snapshot; Google Drive is not used for synchronization or normal CRUD operations. No OAuth client secret should be embedded in the app.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the Expo development server. |
| `npm run android` | Build and run the native Android app. |
| `npm run ios` | Build and run the native iOS app. |
| `npm run web` | Start the web preview. |
| `npm run lint` | Run the Expo ESLint configuration. |
| `npm test` | Run the complete automated test suite. |
| `npm run test:database` | Run the database-focused tests. |

## Project Structure

```text
happy-account/
├── assets/                 # App icons, splash art, fonts, and illustrations
├── components/             # Shared React Native UI components
├── constants/              # Theme and happiness-level constants
├── src/
│   ├── app/                # Expo Router layouts and tab screens
│   ├── data/               # SQLite schema, repositories, dates, and statistics
│   ├── services/           # Google authentication and Drive backup services
│   └── utils/              # CSV import and export utilities
├── tests/                  # Database and CSV tests
├── app.json                # Expo application configuration
└── eas.json                # EAS development, preview, and production profiles
```

## Data and Privacy

Entries are stored locally in `happy-account.db`. The app does not require an account for its core features and does not depend on a remote database. Data leaves the app only when the user explicitly exports a CSV file or enables Google Drive backup; imports read only the file selected by the user.

CSV imports are validated before any database write. Valid rows are inserted in a single transaction, exact duplicates are skipped, and existing entries are never overwritten by an import.

## Testing

Run the test suite:

```bash
npm test
```

The tests cover database migrations and persistence, CRUD operations, statistics and date boundaries, calendar grouping, pagination and filtering, CSV escaping and parsing, duplicate handling, and transactional rollback.

Before opening a pull request, run both checks:

```bash
npm run lint
npm test
```

## Building an APK

The included EAS configuration provides development, preview, and production profiles. After installing and signing in to the EAS CLI, create an installable preview APK with:

```bash
npx eas-cli build --platform android --profile preview
```

## License

This project is distributed under the terms in [LICENSE](LICENSE).
