# App Polish Batch — Design (short)

**Intent:** Twelve independent fixes/features requested for the AtomsApp habit tracker, covering UX bugs, a missing per-habit reminder feature, cosmetic polish, a rebrand to "Habits", and an Android APK-size fix. None of these share a design decision, so they're grouped into one plan as independent tasks rather than split into separate specs.

**Goals:** Each item works correctly on a real device (iOS/Android), nothing regresses existing behavior (streaks, history, sharing, notifications), the app still builds.

**Non-goals:** No backend/server component (everything stays local-only, AsyncStorage + local notifications). No change to `bundleIdentifier`/`package`/`slug` (app.json) during the rename — those affect store identity and signing, left untouched per explicit user decision. No visual redesign beyond what's listed (radii/gaps not explicitly called out are left as-is).

**Constraints:**
- Expo SDK ~54 / RN 0.81, TypeScript, Expo Router. No test framework is configured in this repo — verification is `npx tsc --noEmit`, `npm run lint`, and running the app (Expo Go / `npm run android`), plus small standalone logic checks via `npx tsx` for pure functions where practical.
- `android/` and `ios/` are committed native projects (not purely Expo-managed) — native-facing changes (strings.xml, Info.plist, gradle files) must be hand-edited directly, not just in `app.json`, since there's no `expo prebuild --clean` in this plan.
- No new native dependencies will be added (avoids requiring a native rebuild/pod install for this batch) — the per-habit time picker is a small custom stepper built from existing primitives (`Pressable`), matching the app's existing hand-rolled UI style (color picker, day picker).

**Approaches considered:**
- *Per-habit reminder picker*: custom stepper (chosen) vs. installing `@react-native-community/datetimepicker`. Chosen custom stepper to avoid a native dependency/rebuild in a project with committed native folders, and because it matches the app's existing non-library UI conventions.
- *APK size fix*: per-ABI `splits` in Gradle (chosen) vs. only recommending AAB. Chosen splits because the user explicitly wants to keep installing a direct APK on their phone; AAB alone wouldn't help that workflow. Combined with enabling `minifyEnabled`/`shrinkResources`, which is a pure win either way.
- *Safe-area handling*: `react-native-safe-area-context` (chosen, already a dependency, unused) vs. manual `Dimensions`/`StatusBar` math. Chosen the library since it's already installed and is the standard, device-correct approach.

**What's left to the builder:** exact pixel-level styling choices within each task's stated intent (e.g., exact icon glyph for the save button, exact shade used for the generated app icon gradient) where the spec gives a concrete direction but not a byte-for-byte value.
