# Backup feature — design (short)

## Intent / why
AtomsApp is a personal, unreleased (no Play Store), zero-budget project. Habit
data lives only in AsyncStorage under the `'habits'` key — uninstalling the
app, or AsyncStorage getting cleared, loses everything with no recovery path.
The goal is to protect against that, specifically **uninstall/reinstall data
loss**, without adding cost, accounts, or ongoing maintenance.

## Goals
- Reinstalling the app on the same Android device (same Google account)
  automatically restores habit data, with no sign-in step and no button to
  press.
- A manual, in-app way to export the current habit data to a file the user
  controls (which they can then put anywhere they like — Drive, email, a
  computer, etc. — via the OS share sheet), and a way to import it back.

## Non-goals
- iOS parity. iOS has no equivalent of Android's Auto Backup for a plain
  reinstall (only a full-device iCloud restore covers it), and is out of
  scope here.
- A real Google Drive API integration (OAuth sign-in, Drive REST calls).
  Rejected because it needs a Google Cloud project + OAuth consent screen to
  maintain, and a sign-in flow — real ongoing overhead for a free, personal
  project, when Android's built-in backup already covers the actual goal.
- Scheduled/background backups at a fixed time (e.g. "2am"). Neither OS
  guarantees exact-time background execution without new native background-
  task machinery; not worth it since Android Auto Backup already runs on its
  own schedule, and the manual export covers the rest.
- Merging on import — import always replaces current data, which is simpler
  and avoids ID-collision ambiguity.

## Anti-goals
- No new paid services, consoles, or accounts.
- No background-task native module (`expo-background-task` etc).
- Don't touch files the concurrent `app-polish` worktree session is editing
  (`app/(tabs)/index.tsx`, `utils/notifications.ts`) — this feature adds a
  new file (`utils/backup.ts`) and touches `app/(tabs)/explore.tsx` only,
  which that session isn't touching.

## Constraints
- No new UI library; match existing hand-rolled `Pressable`-based style.
- Minimize new native dependencies — only two, both official Expo modules:
  `expo-sharing` (share sheet for export) and `expo-document-picker` (file
  picker for import). `expo-file-system` is already present transitively and
  will be added as a direct dependency. Adding these requires a rebuild
  (`scripts/build-android.sh` / EAS) before they work in a built app — not a
  cost, just a step to remember.

## Approaches considered
1. **Google Drive API integration (sign-in + Drive REST calls).** True
   cross-platform auto-recovery, but needs an OAuth consent screen, a new
   sign-in UX, and ongoing account maintenance. Rejected — doesn't fit the
   "free, no investment" constraint as well as option 2.
2. **Android Auto Backup (OS-level, Drive-backed) + manual export/import.**
   Chosen. Free, no sign-in, no Drive code, covers the stated goal
   (uninstall/reinstall on the same Android device) automatically, and the
   manual export/import adds a user-controlled safety net (including letting
   the user put the file in Drive themselves, with zero Drive integration
   code).
3. **Local-sandbox-only backup with no export.** Rejected outright early on
   — a file saved only inside the app's own storage disappears along with
   the rest of the app's data on uninstall, so it doesn't meet the actual
   goal.

## Design

### 1. Android Auto Backup (automatic, no UI)
Ensure the app doesn't opt out of Android's built-in backup:
- Confirm/set `android.allowBackup` so it isn't disabled in `app.json`.
- For Android 12+ (API 31+), Android requires explicit backup/data-extraction
  rules to include cloud backup (not just device-transfer) — add a small
  custom Expo config plugin that writes the needed `<data-extraction-rules>`
  XML and references it from the manifest at prebuild time. No native folder
  needs to be hand-edited since none is committed; this runs at
  `expo prebuild`/build time.
- No app code changes — AsyncStorage's on-disk file lives under the app's
  data directory, which Android backs up by default once the above is in
  place.
- Caveat to document for the user: Android runs this backup roughly once
  every ~24h when the device is idle, charging, and on Wi-Fi — not
  instantly after every change.

### 2. Manual export/import
New `utils/backup.ts`:
- `exportHabits()`: reads `'habits'` from AsyncStorage, wraps it as
  `{ version: 1, exportedAt: <ISO date>, habits: [...] }`, writes it with
  `expo-file-system` to a file named `atoms-backup-<YYYY-MM-DD>.json` in the
  app's document directory, then calls `expo-sharing`'s `shareAsync` so the
  user picks where it goes (Drive, Files, email, AirDrop, etc).
- `importHabits()`: opens `expo-document-picker`, reads the picked file with
  `expo-file-system`, validates it's `{ habits: Habit[] }` shaped with the
  expected fields, and on confirmation (an `Alert` warning this replaces
  current data) writes it to AsyncStorage's `'habits'` key.

UI: a small "Backup & Restore" section added to the Stats tab
(`app/(tabs)/explore.tsx`), with two buttons — "Export Backup" and
"Import Backup" — styled like the app's existing buttons.

## Left to the builder
- Exact button placement/copy within the Stats tab layout.
- Exact validation error messages/wording for a malformed import file.
- Whether to also surface a success/failure toast or `Alert` after
  export/import (recommend: yes, `Alert`, matching existing app patterns).
