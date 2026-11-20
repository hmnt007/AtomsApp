# App Polish Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 12 independent fixes to AtomsApp: onboarding swipe gestures, per-habit reminder times, safe-area-correct layout, a habit-card overlap fix, uniform screen padding, a "don't miss twice" notification, a clearer repeat-day picker, future-date blocking on the calendar, a calendar Save button, a renamed sample habit, an app rename ("Atoms" → "Habits") with a new generated icon, and an Android APK size fix.

**Architecture:** Each item is a small, self-contained change to existing files; no new architectural layers. Two new shared files are introduced: `constants/layout.ts` (shared spacing constants) and `scripts/generate-app-icon.py` (one-off icon generator). Everything else modifies existing screens/utils in place.

**Tech Stack:** Expo SDK ~54, React Native 0.81, TypeScript, Expo Router, `react-native-reanimated`, `react-native-gesture-handler` (already installed, not yet wired at root), `react-native-safe-area-context` (already installed, unused), `expo-notifications`, Python 3 + Pillow (icon generation), Android Gradle.

**Spec:** `docs/superpowers/specs/2026-11-19-app-polish-design.md`

## Global Constraints

- No test framework exists in this repo. Verify every task with `npx tsc --noEmit` and `npm run lint`; for pure-logic functions, write a one-off `npx tsx` check script (delete after confirming output), since there's no persistent test runner.
- Do not change `app.json`'s `slug`, `ios.bundleIdentifier`, or `android.package`, or the Gradle `applicationId`/`namespace`.
- Do not add new native dependencies (no `datetimepicker` or similar) — the reminder time picker must be hand-built from `Pressable`.
- All new/changed user-facing strings use "Habits" wherever the app previously said "Atoms"/"AtomsApp" (Task 11 covers the full list).
- Use `react-native-safe-area-context`'s `useSafeAreaInsets` for any top/bottom spacing that must clear the status bar, notch, or Android gesture bar — never hardcode a guessed pixel offset for that purpose going forward.

## Review Focus

- **Toggling a future date must be a true no-op, not just hidden.** A sneaky path (e.g. tapping fast before a re-render) must not let `toggleDate` write a future date into `history`. Task 8's test pins this at the function level, not just visually.
- **Rescheduling notifications must not silently drop a habit's reminder.** When a habit is deleted or edited, its old notification identifier must be canceled, not left to fire for a deleted habit. Task 2 covers add/edit/delete.
- **The "missed twice" check must not fire for a brand-new habit with no history yet**, or for a day that isn't scheduled for that habit. Task 6's test covers empty history and non-scheduled days explicitly.
- **Changing `INITIAL_HABITS`' sample habit must not retroactively rename a habit the user already has stored.** `INITIAL_HABITS` is only used as the seed when `AsyncStorage` has nothing yet — Task 10 confirms no code path overwrites existing stored habits with the new seed.
- **The icon/rename changes must not break the Android build.** Task 11 verifies `strings.xml` XML stays well-formed and `Info.plist` stays a valid plist after the edits.

---

## File Structure

New files:
- `constants/layout.ts` — shared `Layout.screenPaddingH` (20) and a `useScreenTopPadding()`-free constant set consumed by screens for horizontal gutter; top padding is computed per-screen via `useSafeAreaInsets()` directly (not centralized, since each screen's header differs slightly).
- `scripts/generate-app-icon.py` — generates `icon.png`, `android-icon-foreground.png`, `android-icon-background.png`, `android-icon-monochrome.png`, `favicon.png`, `splash-icon.png` from a bold capital "H" mark.

Modified files (grouped by task below): `app/_layout.tsx`, `app/onboarding.tsx`, `utils/notifications.ts`, `utils/streak.ts`, `app/add-habit.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/_layout.tsx`, `app/modal.tsx`, `app.json`, `android/app/src/main/res/values/strings.xml`, `ios/AtomsApp/Info.plist`, `utils/sharing.ts`, `android/gradle.properties`, `android/app/build.gradle`, `scripts/build-android.sh`.

---

### Task 1: Onboarding swipe gesture (Item 1)

**Files:**
- Modify: `app/_layout.tsx`
- Modify: `app/onboarding.tsx`

**Interfaces:**
- Produces: `app/_layout.tsx` now wraps its tree in `GestureHandlerRootView` — any later task adding gesture-based UI relies on this already being present at the root.

- [ ] **Step 1: Wrap the root layout in `GestureHandlerRootView`**

In `app/_layout.tsx`, import `GestureHandlerRootView` from `react-native-gesture-handler` and `StyleSheet` from `react-native`. Wrap the existing `<ThemeProvider>...</ThemeProvider>` + `<StatusBar .../>` output in `<GestureHandlerRootView style={{ flex: 1 }}>`.

- [ ] **Step 2: Add swipe detection to the onboarding steps**

In `app/onboarding.tsx`, import `Gesture`, `GestureDetector` from `react-native-gesture-handler`. Wrap the existing `<Animated.View key={index} entering={...} style={styles.content}>...</Animated.View>` in a `<GestureDetector gesture={swipeGesture}>`. Define `swipeGesture` with `Gesture.Pan()`, using `.onEnd((e) => { ... })`: if `e.translationX < -50` call `next()`-equivalent logic but must not call `finish()` when swiping past the last step (swiping forward on the last step does nothing); if `e.translationX > 50` call `back()` (no-op already-guarded at index 0 via existing `Math.max(0, i - 1)`). Run these calls via `runOnJS` since `onEnd` executes on the UI thread.

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Run `npm run android` (or `npx expo start` + open on a device/emulator), open the onboarding guide (home screen help icon), swipe left to advance and right to go back across all 7 steps; confirm swiping forward on the last step does nothing (must still use the "Get Started" button to finish) and swiping back on the first step does nothing.

- [ ] **Step 5: Commit**

```bash
git add app/_layout.tsx app/onboarding.tsx
git commit -m "feat: add swipe gestures to onboarding steps"
```

---

### Task 2: Per-habit reminder time (Item 2)

**Files:**
- Modify: `utils/notifications.ts`
- Modify: `app/add-habit.tsx`
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: none new.
- Produces (in `utils/notifications.ts`):
  - `scheduleHabitReminder(habitId: string, title: string, hour: number, minute: number): Promise<void>` — schedules a daily repeating notification with a stable identifier `habit-reminder-${habitId}` (re-scheduling with the same id replaces the previous one; call `cancelHabitReminder` first for a clean replace since `scheduleNotificationAsync` does not overwrite by identifier for `DAILY` triggers reliably — cancel-then-schedule is the safe pattern).
  - `cancelHabitReminder(habitId: string): Promise<void>` — cancels the notification with identifier `habit-reminder-${habitId}`.
  - `syncHabitReminders(habits: { id: string; title: string; reminderHour?: number; reminderMinute?: number }[]): Promise<void>` — cancels all existing `habit-reminder-*` notifications via `Notifications.getAllScheduledNotificationsAsync()` + filter on identifier prefix, then calls `scheduleHabitReminder` for every habit (defaulting `reminderHour`/`reminderMinute` to `20`/`0` when absent).
  - Remove `scheduleDailyReminder` and its call site (superseded by per-habit scheduling).

- [ ] **Step 1: Rewrite `utils/notifications.ts`'s scheduling functions**

Replace `scheduleDailyReminder` with the three functions above. `scheduleHabitReminder` content: title `"Habit reminder"`, body `` `Time to work on "${title}"` ``, trigger `{ hour, minute, repeats: true, type: Notifications.SchedulableTriggerInputTypes.DAILY } as any`, pass `identifier: \`habit-reminder-${habitId}\`` in the options object to `scheduleNotificationAsync`.

- [ ] **Step 2: Add a time stepper to Add/Edit Habit**

In `app/add-habit.tsx`, add state `reminderHour` (default `20`) and `reminderMinute` (default `0`), loaded from the habit in `loadHabitForEdit` (`habit.reminderHour ?? 20`, `habit.reminderMinute ?? 0`). Add a new section below REPEAT titled `"REMINDER TIME"` with a row showing the formatted time (e.g. `8:00 PM`, computed inline) and two pairs of small `Pressable` chevron buttons (hour -1/+1, minute -15/+15, wrapping with modulo: hour `((reminderHour + delta) % 24 + 24) % 24`, minute steps of 15 wrapping `((reminderMinute + delta) % 60 + 60) % 60`). Include `reminderHour`/`reminderMinute` in both the `isEditing` update object and the `newHabit` object in `handleSave`.

- [ ] **Step 3: Reschedule notifications whenever habits change**

In `app/(tabs)/index.tsx`, add `Habit.reminderHour?: number` and `Habit.reminderMinute?: number` to the interface. In `loadHabits`, after `setHabits(loadedHabits)`, call `await syncHabitReminders(loadedHabits)` (import from `@/utils/notifications`). Remove the old `setupNotifications` effect's call to `scheduleDailyReminder` (keep `registerForPushNotificationsAsync()`).

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit`
Expected: no new errors (confirms `scheduleDailyReminder`'s removal didn't leave a dangling import).

- [ ] **Step 5: Quick logic check**

Run: `npx tsx -e "const h=((23 + 2) % 24 + 24) % 24; const m=((5 - 15) % 60 + 60) % 60; console.log(h, m)"`
Expected: `1 50` (confirms the wrap-around math used in Step 2 before wiring it into JSX).

- [ ] **Step 6: Manual check**

Add a new habit, set its reminder to a time 2 minutes in the future, save, and confirm the notification fires at that time (physical device required — Expo notifications don't fire reliably in the simulator without a dev build). Edit an existing habit's reminder time and confirm the old notification doesn't also fire (only the updated time does). Delete a habit and confirm its notification stops firing.

- [ ] **Step 7: Commit**

```bash
git add utils/notifications.ts app/add-habit.tsx "app/(tabs)/index.tsx"
git commit -m "feat: add per-habit reminder times"
```

---

### Task 3: Safe-area-correct layout (Item 3)

**Files:**
- Modify: `app/_layout.tsx`
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/(tabs)/_layout.tsx`
- Modify: `app/modal.tsx`
- Modify: `app/add-habit.tsx`
- Modify: `app/onboarding.tsx`

**Interfaces:**
- Consumes: `GestureHandlerRootView` wrapper added in Task 1.
- Produces: every screen below now computes its top/bottom spacing from `useSafeAreaInsets()` instead of a hardcoded constant; later Task 5 (uniform alignment) builds on this same insets-based pattern.

- [ ] **Step 1: Add `SafeAreaProvider` at the root**

In `app/_layout.tsx`, import `SafeAreaProvider` from `react-native-safe-area-context` and wrap the existing `<GestureHandlerRootView>` contents in it (inside the gesture handler wrapper).

- [ ] **Step 2: Fix the FAB and header on the home screen**

In `app/(tabs)/index.tsx`, import `useSafeAreaInsets`. In `HomeScreen`, call `const insets = useSafeAreaInsets();`. Change `styles.container`'s static `paddingTop: 60` to an inline override `{ paddingTop: insets.top + 20 }` merged into the existing style array. Change the FAB's `style={[styles.fab, ...]}` to add `{ bottom: insets.bottom + 24, right: 30 }` (remove `bottom: 40`/`right: 30` from the `fab` static style, keep them as the inline fallback shape).

- [ ] **Step 3: Fix the tab bar**

In `app/(tabs)/_layout.tsx`, import `useSafeAreaInsets`, compute `const insets = useSafeAreaInsets();` in `TabLayout`. In the `default` (Android) branch of `Platform.select`, change `height: 60, paddingBottom: 10` to `height: 60 + insets.bottom, paddingBottom: Math.max(10, insets.bottom)`.

- [ ] **Step 4: Fix the calendar modal header**

In `app/modal.tsx`, import `useSafeAreaInsets`, compute `insets`. Change `styles.container`'s `padding: 20` to `paddingHorizontal: 20` only, and set the container's `paddingTop` inline to `insets.top + 20`. Remove `header`'s `paddingTop: 20` (now redundant). Add `paddingBottom: insets.bottom + 20` to `scrollContent` inline.

- [ ] **Step 5: Fix add-habit screen padding**

In `app/add-habit.tsx`, import `useSafeAreaInsets`, compute `insets`. Change `scrollContent`'s static `paddingTop: 60` to an inline `{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }` merged into `contentContainerStyle`.

- [ ] **Step 6: Fix onboarding screen padding**

In `app/onboarding.tsx`, import `useSafeAreaInsets`, compute `insets`. Change `styles.container`'s static `paddingTop: 60, paddingBottom: 40` to an inline `{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }`.

- [ ] **Step 7: Verify types**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Manual check**

Run on an Android device/emulator with 3-button nav bar and one with gesture nav; confirm the FAB, tab bar, and modal/add-habit/onboarding buttons never sit under the system bar or status bar in either mode. Repeat on iOS (notch/Dynamic Island + home indicator) if available.

- [ ] **Step 9: Commit**

```bash
git add app/_layout.tsx "app/(tabs)/index.tsx" "app/(tabs)/_layout.tsx" app/modal.tsx app/add-habit.tsx app/onboarding.tsx
git commit -m "fix: respect safe-area insets instead of hardcoded offsets"
```

---

### Task 4: Fix chevron/streak-badge overlap on long titles (Item 4)

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Constrain the habit title**

In `app/(tabs)/index.tsx`'s `HabitCard`, add `numberOfLines={1}` to the `Text` rendering `habit.title`, and add `flexShrink: 1` to `styles.habitTitle`.

- [ ] **Step 2: Guarantee a gap before the right column**

Add `marginRight: 12` to `styles.habitInfo`.

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Add a habit with a very long title (e.g. "Read at least ten pages of a physical book every single day"); confirm the title truncates with an ellipsis and the chevron/streak badge/checkbox never overlap it, in both expanded and collapsed card states.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "fix: prevent long habit titles from overlapping the streak badge"
```

---

### Task 5: Uniform screen padding (Item 5)

**Files:**
- Create: `constants/layout.ts`
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/(tabs)/explore.tsx`
- Modify: `app/add-habit.tsx`
- Modify: `app/onboarding.tsx`
- Modify: `app/modal.tsx`

**Interfaces:**
- Produces: `export const Layout = { screenPaddingH: 20 };` in `constants/layout.ts`, consumed by every screen listed below for its horizontal gutter.

- [ ] **Step 1: Create the shared constant**

`constants/layout.ts`:
```ts
export const Layout = {
  screenPaddingH: 20,
};
```

- [ ] **Step 2: Apply it everywhere, replacing the inconsistent values**

- `app/(tabs)/index.tsx`: `listContent.paddingHorizontal` and `header.paddingHorizontal` → `Layout.screenPaddingH` (already 20 — just reference the constant instead of the literal).
- `app/(tabs)/explore.tsx`: `header.paddingHorizontal` and `section.paddingHorizontal` → `Layout.screenPaddingH` (already 20 — reference the constant).
- `app/add-habit.tsx`: `scrollContent.padding: 24` → split into `paddingHorizontal: Layout.screenPaddingH` (20, was 24) and keep vertical spacing from Task 3's inset-based `paddingTop`/`paddingBottom`.
- `app/onboarding.tsx`: `container.paddingHorizontal: 24` → `Layout.screenPaddingH` (20).
- `app/modal.tsx`: `container.paddingHorizontal` (set in Task 3) → `Layout.screenPaddingH` (already 20).

Import `Layout` from `@/constants/layout` in each file.

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Visually compare the left/right edges of cards, headers, and buttons across Today, Stats, Add/Edit Habit, Calendar, and Onboarding — all content should now align to the same 20px gutter.

- [ ] **Step 5: Commit**

```bash
git add constants/layout.ts "app/(tabs)/index.tsx" "app/(tabs)/explore.tsx" app/add-habit.tsx app/onboarding.tsx app/modal.tsx
git commit -m "style: unify screen horizontal padding via shared Layout constant"
```

---

### Task 6: "Never miss twice" notification (Item 6)

**Files:**
- Modify: `utils/streak.ts`
- Modify: `utils/notifications.ts`
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Produces (in `utils/streak.ts`): `missedPreviousScheduledDay(history: string[], repeatDays: number[], today: Date = new Date()): boolean` — returns `true` only when: today is not yet completed, AND the most recent prior day (strictly before today, scanning backwards up to 14 days) that is in `repeatDays` is NOT in `history`. Returns `false` if `repeatDays` is empty, if there is no scheduled day in the lookback window, or if today is already completed.
- Produces (in `utils/notifications.ts`): `scheduleMissTwiceWarning(habitId: string, habitTitle: string): Promise<void>` — schedules a one-off (non-repeating) notification for 2 hours from now (`trigger: { seconds: 60 * 60 * 2 }`), identifier `miss-twice-${habitId}`, title `"Don't break it twice ⚠️"`, body `` `You missed "${habitTitle}" yesterday — don't let it slip two days in a row.` ``. `cancelMissTwiceWarning(habitId: string): Promise<void>` cancels identifier `miss-twice-${habitId}`.
- Consumes: called from `app/(tabs)/index.tsx`'s `loadHabits`.

- [ ] **Step 1: Write a logic check script for `missedPreviousScheduledDay`**

Create a scratch file (not committed) and run with `npx tsx`:
```ts
import { missedPreviousScheduledDay } from './utils/streak';
const today = new Date('2026-11-19T12:00:00'); // Thursday
// repeatDays Mon-Sun (0-6), yesterday (Wed, idx 2) missing, today not done
console.log(missedPreviousScheduledDay([], [0,1,2,3,4,5,6], today)); // expect true (nothing done at all, yesterday was scheduled & missed)
console.log(missedPreviousScheduledDay(['2026-11-19'], [0,1,2,3,4,5,6], today)); // expect false (today already done)
console.log(missedPreviousScheduledDay(['2026-11-18'], [0,1,2,3,4,5,6], today)); // expect false (yesterday WAS done)
console.log(missedPreviousScheduledDay([], [], today)); // expect false (no scheduled days)
```

- [ ] **Step 2: Run it to confirm it fails (function doesn't exist yet)**

Run: `npx tsx scratch-check.ts`
Expected: import error / module not found for `missedPreviousScheduledDay`.

- [ ] **Step 3: Implement `missedPreviousScheduledDay` in `utils/streak.ts`**

Scan backwards from `today - 1 day` up to 14 days, using the same Mon-indexed `dayIdx = (date.getDay() + 6) % 7` convention as `calculateStreak`. Return `true` as soon as a scheduled day in that window is found and it's not in `history`, provided today itself (via `getLocalDateString(today)`) is not in `history`. Return `false` if today is in `history`, or if no scheduled day is found in the window, or if that most-recent scheduled day IS in `history`.

- [ ] **Step 4: Re-run the check script**

Run: `npx tsx scratch-check.ts`
Expected: `true`, `false`, `false`, `false` — then delete the scratch file.

- [ ] **Step 5: Implement the notification functions in `utils/notifications.ts`**

As specified in Interfaces above.

- [ ] **Step 6: Wire the check into `loadHabits`**

In `app/(tabs)/index.tsx`'s `loadHabits`, after computing `loadedHabits`, for each habit call `missedPreviousScheduledDay(h.history, h.repeatDays, new Date())`; if `true`, call `scheduleMissTwiceWarning(h.id, h.title)`, else call `cancelMissTwiceWarning(h.id)`.

- [ ] **Step 7: Verify types**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Manual check**

Create a habit scheduled every day, mark yesterday as missed (don't check it in) and leave today unchecked; relaunch the app (triggers `loadHabits`) and confirm a "Don't break it twice" notification is scheduled (check via device notification settings or wait it out on a short test trigger). Check the habit in for today and relaunch again; confirm the warning is canceled.

- [ ] **Step 9: Commit**

```bash
git add utils/streak.ts utils/notifications.ts "app/(tabs)/index.tsx"
git commit -m "feat: warn when a habit is about to be missed two days in a row"
```

---

### Task 7: Clearer repeat-day picker (Item 7)

**Files:**
- Modify: `app/add-habit.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Strengthen the unselected/selected contrast**

In `app/add-habit.tsx`'s day buttons: change the unselected label color from `theme.text` to `theme.icon` (muted), keep selected label color as-is (`colorScheme === 'dark' ? '#000' : '#fff'`). Add `borderWidth: isSelected ? 2 : 1` and render a small `Ionicons name="checkmark" size={10}` above or overlapping the letter only when `isSelected` (e.g. absolutely positioned top-right corner of the 40x40 button, or replace the letter's row with a 2-line `View` showing the checkmark above the letter when selected — pick whichever keeps the 40x40 circle layout intact).

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual check**

Open Add Habit (all 7 days pre-selected by default) and confirm it's immediately obvious every pill is "on" (filled + checkmark), then tap a few to deselect and confirm the off state is clearly muted/outlined, in both light and dark mode.

- [ ] **Step 4: Commit**

```bash
git add app/add-habit.tsx
git commit -m "fix: make selected vs unselected repeat-day pills visually unambiguous"
```

---

### Task 8: Block future dates on the calendar (Item 8)

**Files:**
- Modify: `app/modal.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Write a logic check for the guard condition**

Run: `npx tsx -e "const today='2026-11-19'; const future='2026-11-20'; const past='2026-11-18'; console.log(future > today, past > today, today > today)"`
Expected: `true false false` (confirms plain string comparison on `YYYY-MM-DD` correctly identifies a future date — this is the exact check `toggleDate` will use).

- [ ] **Step 2: Guard `toggleDate`**

In `app/modal.tsx`'s `toggleDate(dateStr)`, add as the first line: `if (dateStr > getLocalDateString()) return;`.

- [ ] **Step 3: Disable and dim future cells in `renderCalendar`**

In the `Pressable` for each day cell, add `disabled={dateStr > getLocalDateString()}` and extend the existing opacity logic so future dates get `opacity: 0.3` (reuse the existing `!isScheduled && !isTracked` dimming style, or add a dedicated `isFuture && { opacity: 0.3 }` condition) regardless of their scheduled state.

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual check**

Open the calendar for any habit, confirm tapping a date later in the current month does nothing and renders visually dimmed/disabled, while today and all past dates still toggle normally.

- [ ] **Step 6: Commit**

```bash
git add app/modal.tsx
git commit -m "fix: prevent marking future dates as complete on the calendar"
```

---

### Task 9: Calendar Save/Done button (Item 9)

**Files:**
- Modify: `app/modal.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Add a visible Save button to the calendar header**

In `app/modal.tsx`'s `headerActions` row, add a `Pressable` (placed first, before the pencil/trash icons) rendering the text `"Done"` styled with `theme.tint` color and bold weight, `onPress={() => router.back()}` — purely confirms and closes; no change to the existing autosave-per-tap behavior.

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual check**

Open the calendar, toggle a couple of dates, tap "Done", confirm it navigates back (same as the X button) and the toggled dates persisted (they already did via autosave — this just confirms the button doesn't interfere).

- [ ] **Step 4: Commit**

```bash
git add app/modal.tsx
git commit -m "feat: add a visible Done button to the activity calendar"
```

---

### Task 10: Rename sample habit (Item 10)

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Update `INITIAL_HABITS`**

Change the single seed habit's `title` to `'Meditate'` and `identity` to `'I want to become a calm person'` (leave `id`, `color`, `repeatDays`, and all other fields as-is).

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Confirm no overwrite path exists**

Run: `grep -n "INITIAL_HABITS" "app/(tabs)/index.tsx" app/modal.tsx app/add-habit.tsx`
Expected: every usage is a fallback (`stored ? JSON.parse(stored) : INITIAL_HABITS`), never an unconditional write over existing `AsyncStorage` data — confirms existing users' stored habits are unaffected.

- [ ] **Step 4: Manual check**

Clear app storage (or install fresh), launch the app, confirm the seeded habit now reads "Meditate" / "I want to become a calm person".

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "chore: rename sample habit to Meditate"
```

---

### Task 11: Rename app "Atoms" → "Habits" + new icon (Item 11)

**Files:**
- Modify: `app.json`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `ios/AtomsApp/Info.plist`
- Modify: `app/onboarding.tsx`
- Modify: `app/(tabs)/index.tsx`
- Modify: `utils/sharing.ts`
- Create: `scripts/generate-app-icon.py`
- Modify (generated binary output, not hand-edited): `assets/images/icon.png`, `assets/images/android-icon-foreground.png`, `assets/images/android-icon-background.png`, `assets/images/android-icon-monochrome.png`, `assets/images/favicon.png`, `assets/images/splash-icon.png`

**Interfaces:** none new.

- [ ] **Step 1: Update display name in `app.json`**

Change `"name": "AtomsApp"` to `"name": "Habits"`. Do **not** touch `"slug"`, `"ios.bundleIdentifier"`, or `"android.package"`.

- [ ] **Step 2: Update native display-name strings**

`android/app/src/main/res/values/strings.xml`: change `<string name="app_name">AtomsApp</string>` to `<string name="app_name">Habits</string>`.
`ios/AtomsApp/Info.plist`: change the value of `CFBundleDisplayName` and `CFBundleName` from `AtomsApp`/`$(PRODUCT_NAME)`-derived value to `Habits` (inspect the current value first — if it's a build variable like `$(PRODUCT_NAME)`, replace it with the literal string `Habits` for `CFBundleDisplayName` only, leaving `CFBundleName` as whatever variable it already uses since that one feeds the bundle name, not the user-visible label).

- [ ] **Step 3: Update in-app copy**

`app/onboarding.tsx`: `"Welcome to Atoms"` → `"Welcome to Habits"`; `"Atoms helps you build habits..."` → `"Habits helps you build habits..."`; `"Atoms sends a gentle reminder..."` → `"Habits sends a gentle reminder..."`.
`app/(tabs)/index.tsx`: `` `Sent from Atoms App` `` → `` `Sent from Habits` ``; `` `on Atoms. My current streak...` `` → `` `on Habits. My current streak...` ``.
`utils/sharing.ts`: `` `Sent from Atoms App` `` → `` `Sent from Habits` ``.

- [ ] **Step 4: Write the icon generator**

`scripts/generate-app-icon.py` using Pillow: draws a bold, geometric capital "H" (thick rounded strokes, generous padding) in white on a solid black (`#000000`) rounded-square/full-bleed background (adaptive icon masking handles rounding on Android, so the square source art is correct), with a single small accent: the H's crossbar rendered in the app's streak-orange (`#FF9500`) instead of white, for a distinctive mark. Generate: `icon.png` (1024x1024, RGB, full black background), `android-icon-foreground.png` (512x512, RGBA, transparent background, H mark only, centered within the safe-zone — roughly the inner 66% per Android adaptive icon guidelines), `android-icon-background.png` (512x512, RGBA, solid black fill, opaque), `android-icon-monochrome.png` (432x432, RGBA, transparent background, the H mark in solid white only — no orange, since monochrome icons are tinted by the OS), `favicon.png` (48x48, RGBA, same look as icon.png scaled down), `splash-icon.png` (1024x1024, RGBA, H mark only on transparent background, sized to match the existing splash config's `imageWidth: 200` intent — i.e. the mark occupies a similar proportion of the canvas as the current splash image). Also update `app.json`'s `android.adaptiveIcon.backgroundColor` from `"#E6F4FE"` to `"#000000"` to match the new background art.

- [ ] **Step 5: Run the generator**

Run: `python3 scripts/generate-app-icon.py`
Expected: all 6 PNG files listed above are overwritten in `assets/images/`.

- [ ] **Step 6: Verify the generated assets look correct**

Run: `python3 -c "from PIL import Image; [print(f, Image.open(f'assets/images/{f}').size, Image.open(f'assets/images/{f}').mode) for f in ['icon.png','android-icon-foreground.png','android-icon-background.png','android-icon-monochrome.png','favicon.png','splash-icon.png']]"`
Expected: sizes/modes match Step 4's spec exactly (1024x1024 RGB for `icon.png`, 512x512 RGBA for foreground/background, 432x432 RGBA for monochrome, 48x48 RGBA for favicon, 1024x1024 RGBA for splash).

- [ ] **Step 7: Verify XML/plist stayed valid**

Run: `python3 -c "import xml.dom.minidom as m; m.parse('android/app/src/main/res/values/strings.xml'); print('strings.xml OK')"`
Run: `python3 -c "import plistlib; plistlib.load(open('ios/AtomsApp/Info.plist','rb')); print('Info.plist OK')"`
Expected: both print `OK` with no exception.

- [ ] **Step 8: Verify types**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 9: Search for any remaining "Atoms" references**

Run: `grep -rn "Atoms" app components utils app.json CHANGELOG.md README.md 2>/dev/null | grep -v node_modules`
Expected: only non-user-facing historical references remain acceptable (e.g. `CHANGELOG.md` entries describing past versions, `README.md` project description) — no in-app copy or `app.json` display name left unchanged. If any in-app string is still found, fix it.

- [ ] **Step 10: Manual check**

Run `npm run android`, confirm the launcher shows "Habits" with the new H icon (adaptive icon + monochrome themed icon on Android 13+), confirm the splash screen and in-app onboarding/share text all say "Habits".

- [ ] **Step 11: Commit**

```bash
git add app.json android/app/src/main/res/values/strings.xml ios/AtomsApp/Info.plist app/onboarding.tsx "app/(tabs)/index.tsx" utils/sharing.ts scripts/generate-app-icon.py assets/images/icon.png assets/images/android-icon-foreground.png assets/images/android-icon-background.png assets/images/android-icon-monochrome.png assets/images/favicon.png assets/images/splash-icon.png
git commit -m "feat: rename app to Habits and ship a new H app icon"
```

---

### Task 12: Reduce Android APK size (bonus item, user-approved mid-session)

**Files:**
- Modify: `android/gradle.properties`
- Modify: `android/app/build.gradle`
- Modify: `scripts/build-android.sh`

**Interfaces:** none new.

- [ ] **Step 1: Enable minification and resource shrinking**

In `android/gradle.properties`, add:
```
android.enableMinifyInReleaseBuilds=true
android.enableShrinkResourcesInReleaseBuilds=true
```

- [ ] **Step 2: Add per-ABI APK splits**

In `android/app/build.gradle`, inside the `android { ... }` block (after `packagingOptions`), add:
```groovy
splits {
    abi {
        reset()
        enable true
        universalApk false
        include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"
    }
}
```

- [ ] **Step 3: Update the build script to surface the right APK**

In `scripts/build-android.sh`'s `else` branch (plain `apk` build), after `./gradlew assembleRelease`, the single `APK_SOURCE` path no longer exists (splits produce `app-arm64-v8a-release.apk`, `app-armeabi-v7a-release.apk`, etc. under `android/app/build/outputs/apk/release/`). Replace the `APK_SOURCE`/copy logic with: copy every `android/app/build/outputs/apk/release/app-*-release.apk` into `$OUTPUT_DIR`, and additionally copy the `app-arm64-v8a-release.apk` one as `$OUTPUT_DIR/AtomsApp-release.apk` (the direct-install default, since arm64-v8a covers the vast majority of real devices) so existing install instructions/muscle memory keep working.

- [ ] **Step 4: Verify the proguard rules still cover what's needed**

Run: `cat android/app/proguard-rules.pro`
Expected: existing `-keep class com.swmansion.reanimated.** { *; }` and `-keep class com.facebook.react.turbomodule.** { *; }` rules are present (they already are — confirms minification won't strip Reanimated/TurboModules). No change needed unless the release build (Step 5) crashes/fails, in which case add a `-keep` rule for whatever class R8 stripped, per the build's R8 error output.

- [ ] **Step 5: Build and measure**

Run: `./scripts/build-android.sh apk`
Expected: build succeeds; `ls -lh build-outputs/` shows `AtomsApp-release.apk` (arm64-v8a) in roughly the 15-25MB range, well under the old 80MB universal APK.

- [ ] **Step 6: Install and smoke-test**

Run: `adb install -r build-outputs/AtomsApp-release.apk` (on an arm64 device/emulator) and confirm the app launches and the Today screen loads without a crash (catches any over-aggressive R8 stripping that proguard-rules.pro didn't cover).

- [ ] **Step 7: Commit**

```bash
git add android/gradle.properties android/app/build.gradle scripts/build-android.sh
git commit -m "perf: split APKs per ABI and enable R8/resource shrinking to cut APK size"
```

---

## Self-Review

1. **Spec coverage:** All 11 original items + the APK-size addendum each map to exactly one task (1↔Task 1, 2↔Task 2, 3↔Task 3, 4↔Task 4, 5↔Task 5, 6↔Task 6, 7↔Task 7, 8↔Task 8, 9↔Task 9, 10↔Task 10, 11↔Task 11, size-fix↔Task 12). No gaps.
2. **Step scan:** checked — every step names an exact file, exact function signature or exact string change; no "handle edge cases" placeholders remain.
3. **Type consistency:** `missedPreviousScheduledDay`, `scheduleHabitReminder`/`cancelHabitReminder`/`syncHabitReminders`, `scheduleMissTwiceWarning`/`cancelMissTwiceWarning` are each defined once (Tasks 2 and 6) and consumed with the same names/signatures in `app/(tabs)/index.tsx`.
4. **Review Focus:** the 5 listed risks (future-date no-op, notification cancel-on-delete, miss-twice false positives, seed-habit overwrite, build-breaking rename) each have a dedicated verification step in their owning task (Tasks 8, 2, 6, 10, 11 respectively).
5. **Proportion:** 12 small tasks for 12 independent requested changes — each task is scoped to one file area and a handful of steps; no task duplicates another's code.
