# Backup Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect AtomsApp's habit data against uninstall/reinstall data loss (free, Android-only, via OS-level Auto Backup) and give the user a manual in-app way to export/import their habits as a file.

**Architecture:** Two independent pieces. (1) A custom Expo config plugin + `app.json` change that makes Android's built-in Auto Backup cover the app's storage — config only, no runtime code. (2) A new `utils/backup.ts` module (export/import logic over AsyncStorage + the filesystem/share sheet/file picker) plus a small UI section added to the Stats tab (`app/(tabs)/explore.tsx`) that calls it.

**Tech Stack:** Expo SDK 54, React Native, TypeScript, AsyncStorage, `expo-file-system` (legacy API), `expo-sharing`, `expo-document-picker`.

**Spec:** [docs/superpowers/specs/2026-11-19-backup-feature-design.md](../specs/2026-11-19-backup-feature-design.md)

## Global Constraints

- No new UI library — match the existing hand-rolled `Pressable`-based style used in `app/(tabs)/explore.tsx`.
- Exactly two new native dependencies: `expo-sharing` and `expo-document-picker`. `expo-file-system` becomes a direct dependency (it's already present transitively).
- Do not modify `app/(tabs)/index.tsx` or `utils/notifications.ts` — owned by a concurrent sibling session.
- No Google Sign-In, no Drive API calls, no OAuth.
- No background-task native module (e.g. `expo-background-task`); Android Auto Backup is handled entirely by the OS.
- Import always **replaces** the current `'habits'` AsyncStorage value — no merge logic.
- New native dependencies require a rebuild (`npx expo prebuild` + `scripts/build-android.sh` or EAS) before they work in a built app — document this, don't try to work around it.

## Review Focus

- A malformed/corrupted import file (invalid JSON, or valid JSON missing required `Habit` fields) must show a clear error, not crash or silently wipe the user's habits.
- Cancelling the document picker (import) or the share sheet (export) must be a silent no-op, not an error `Alert`.
- Exporting with zero habits (`habits` is `[]` or not yet set in AsyncStorage) must still produce a valid backup file, not throw.
- `expo-sharing` being unavailable on the current platform must show a clear message instead of crashing.
- Import must warn the user with a confirmable `Alert` (Cancel/Replace) before overwriting current data, since it's destructive and irreversible from within the app.

---

### Task 1: Android Auto Backup config plugin

**Files:**
- Create: `plugins/withAndroidBackupRules.js`
- Modify: `app.json`

**Interfaces:**
- Produces: nothing consumed by later tasks — this task is config/build-time only, no runtime exports.

- [ ] **Step 1: Create the config plugin `plugins/withAndroidBackupRules.js`**

A CommonJS Expo config plugin exporting a default function `withAndroidBackupRules(config)` that:
- Uses `withDangerousMod(config, ['android', async (config) => { ... }])` to write the file `android/app/src/main/res/xml/backup_rules.xml` (creating the `res/xml` directory if missing) with this exact content:
  ```xml
  <?xml version="1.0" encoding="utf-8"?>
  <data-extraction-rules>
      <cloud-backup>
          <include domain="sharedpref" path="." />
          <include domain="database" path="." />
          <include domain="file" path="." />
      </cloud-backup>
      <device-transfer>
          <include domain="sharedpref" path="." />
          <include domain="database" path="." />
          <include domain="file" path="." />
      </device-transfer>
  </data-extraction-rules>
  ```
- Uses `withAndroidManifest(config)` to set on the `<application>` element: `android:allowBackup="true"`, `android:dataExtractionRules="@xml/backup_rules"`, `android:fullBackupContent="true"`.
- Returns the modified `config` from both mods, per the standard Expo config plugin pattern (`@expo/config-plugins` exports `withDangerousMod`, `withAndroidManifest`, `AndroidConfig`).

- [ ] **Step 2: Register the plugin and set `allowBackup` in `app.json`**

In `app.json`'s `expo.plugins` array, add `"./plugins/withAndroidBackupRules.js"`. In `expo.android`, add `"allowBackup": true` (explicit, alongside the existing `adaptiveIcon`/`edgeToEdgeEnabled`/`predictiveBackGestureEnabled`/`package` keys).

- [ ] **Step 3: Verify by running a dry Android prebuild**

Run: `npx expo prebuild --platform android --no-install`
Expected: command succeeds, then:
- `grep -A2 dataExtractionRules android/app/src/main/AndroidManifest.xml` shows `android:dataExtractionRules="@xml/backup_rules"` and `android:allowBackup="true"` on the `<application>` tag.
- `cat android/app/src/main/res/xml/backup_rules.xml` shows the exact XML from Step 1.

- [ ] **Step 4: Commit**

```bash
git add plugins/withAndroidBackupRules.js app.json
git commit -m "feat: enable Android Auto Backup via config plugin"
```

---

### Task 2: `utils/backup.ts` export/import logic

**Files:**
- Create: `utils/backup.ts`
- Modify: `package.json` (new dependencies)

**Interfaces:**
- Consumes: `Habit` type from `app/(tabs)/index.tsx` (already exported there as `export interface Habit`).
- Produces (consumed by Task 3):
  - `export interface BackupFile { version: 1; exportedAt: string; habits: Habit[] }`
  - `export async function exportHabits(): Promise<{ success: boolean; fileUri?: string; error?: string }>`
  - `export async function importHabits(): Promise<{ success: boolean; count?: number; cancelled?: boolean; error?: string }>`

- [ ] **Step 1: Add the new dependencies**

Run: `npx expo install expo-file-system expo-sharing expo-document-picker`
Expected: `package.json` gains direct entries for all three; this requires a rebuild before they work in a built app (no action needed here, just note it).

- [ ] **Step 2: Write `isValidBackup` and the `BackupFile` type in `utils/backup.ts`**

```ts
import type { Habit } from '@/app/(tabs)/index';

export interface BackupFile {
  version: 1;
  exportedAt: string;
  habits: Habit[];
}

function isValidBackup(data: unknown): data is BackupFile {
  if (!data || typeof data !== 'object') return false;
  const d = data as any;
  if (d.version !== 1 || !Array.isArray(d.habits)) return false;
  return d.habits.every((h: any) =>
    h && typeof h === 'object' &&
    typeof h.id === 'string' &&
    typeof h.title === 'string' &&
    typeof h.identity === 'string' &&
    typeof h.completed === 'boolean' &&
    typeof h.streak === 'number' &&
    Array.isArray(h.history) &&
    Array.isArray(h.repeatDays) &&
    typeof h.color === 'string'
  );
}
```

- [ ] **Step 3: Implement `exportHabits(): Promise<{ success: boolean; fileUri?: string; error?: string }>` in `utils/backup.ts`**

Use `import * as FileSystem from 'expo-file-system/legacy'` and `import * as Sharing from 'expo-sharing'`. Steps inside the function:
1. Read `AsyncStorage.getItem('habits')`; `JSON.parse` it, or use `[]` if `null`.
2. Build a `BackupFile`: `{ version: 1, exportedAt: new Date().toISOString(), habits }`.
3. Write it with `FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup, null, 2))` to `` `${FileSystem.documentDirectory}atoms-backup-${getLocalDateString()}.json` `` (reuse `getLocalDateString` from `@/utils/date`).
4. If `!(await Sharing.isAvailableAsync())`, return `{ success: false, error: 'Sharing is not available on this device.' }`.
5. Otherwise `await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Export Atoms Backup' })` and return `{ success: true, fileUri }`.
6. Wrap the whole body in try/catch; on error return `{ success: false, error: String(error) }`.

- [ ] **Step 4: Implement `importHabits(): Promise<{ success: boolean; count?: number; cancelled?: boolean; error?: string }>` in `utils/backup.ts`**

Use `import * as DocumentPicker from 'expo-document-picker'` and `DeviceEventEmitter` from `react-native` (matching the existing `'habitsUpdated'` event pattern used in `app/(tabs)/index.tsx`, `app/add-habit.tsx`, `app/modal.tsx`). Steps inside the function:
1. `const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true })`.
2. If `result.canceled`, return `{ success: false, cancelled: true }`.
3. Read `FileSystem.readAsStringAsync(result.assets[0].uri)`, `JSON.parse` it.
4. If parsing throws, or `isValidBackup(parsed)` is false, return `{ success: false, error: 'This file is not a valid Atoms backup.' }`.
5. `await AsyncStorage.setItem('habits', JSON.stringify(parsed.habits))`, then `DeviceEventEmitter.emit('habitsUpdated')`, then return `{ success: true, count: parsed.habits.length }`.
6. Wrap the whole body in try/catch; on error return `{ success: false, error: String(error) }`.

- [ ] **Step 5: Verify with typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors referencing `utils/backup.ts`.

Run: `npm run lint`
Expected: no errors/warnings referencing `utils/backup.ts`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json utils/backup.ts
git commit -m "feat: add export/import backup logic"
```

---

### Task 3: "Backup & Restore" UI section on the Stats tab

**Files:**
- Modify: `app/(tabs)/explore.tsx`

**Interfaces:**
- Consumes: `exportHabits()` and `importHabits()` from Task 2 (`@/utils/backup`), with the exact return shapes defined there.

- [ ] **Step 1: Add state, handlers, and the section to `app/(tabs)/explore.tsx`**

- Add `const [busy, setBusy] = React.useState<'export' | 'import' | null>(null);` near the other `useState` calls.
- Add `handleExport`: sets `busy` to `'export'`, calls `exportHabits()`, on `{ success: false, error }` shows `Alert.alert('Export failed', error)`, clears `busy` in a `finally`. No alert on plain success (the share sheet itself is the confirmation) and no alert when the user just dismissed the share sheet.
- Add `handleImport`: shows `Alert.alert('Import backup?', 'This replaces all current habits with the ones in the file you pick. This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Replace', style: 'destructive', onPress: async () => { ...calls importHabits(), sets busy, shows Alert.alert('Import failed', error) on failure or Alert.alert('Import complete', `Imported ${count} habit(s).`) on success, ignores the `cancelled` case silently... } }])`.
- Add a new `<View style={styles.section}>` block, placed after the existing "Identity Shifts" section and before the closing `</ScrollView>`, with:
  - `<Text style={[styles.sectionTitle, { color: theme.text }]}>Backup & Restore</Text>`
  - Two `Pressable` buttons styled like `identityCard` (reuse `styles.identityCard`/a new matching style if `identityCard`'s `alignItems: 'center'` doesn't fit a button row — use a new `styles.backupRow` with `flexDirection: 'row', gap: 12` wrapping two `styles.backupButton` Pressables, each `flex: 1, padding: 16, borderRadius: 20, borderWidth: 1, alignItems: 'center'`, background `theme.card`, border `theme.border`), each showing an `Ionicons` icon (`"cloud-upload-outline"` for export, `"cloud-download-outline"` for import) + label text, `disabled={busy !== null}`, `opacity: busy ? 0.6 : 1`.
- Import `Alert` from `react-native` and `exportHabits, importHabits` from `@/utils/backup` at the top of the file.

- [ ] **Step 2: Verify with typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors referencing `app/(tabs)/explore.tsx`.

Run: `npm run lint`
Expected: no errors/warnings referencing `app/(tabs)/explore.tsx`.

- [ ] **Step 3: Manual device/simulator verification**

On a running dev build (per the project's existing manual-testing convention — no automated test framework):
- Tap "Export Backup" with at least one habit present → OS share sheet opens with a `.json` file; dismissing it does not show an error.
- Tap "Import Backup" → confirm `Alert` appears; tapping "Cancel" does nothing.
- Tap "Import Backup" → "Replace", pick the previously exported file → habits list on the Today tab matches what was exported, and a success `Alert` with the correct count shows.
- Tap "Import Backup" → "Replace", pick an unrelated non-JSON or malformed file → "Import failed" `Alert` shows, existing habits are unchanged.

- [ ] **Step 4: Commit**

```bash
git add app/\(tabs\)/explore.tsx
git commit -m "feat: add backup & restore UI to Stats tab"
```
