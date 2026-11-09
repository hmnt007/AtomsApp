# Changelog

All notable changes to the AtomsApp project will be documented in this file.

## [1.4.0] - 2026-11-09

### Added
- **Onboarding Guide**: A 7-step walkthrough of every feature, with Next, Back and Skip. Shown on first launch, and can be replayed from the help button on the Today screen.
- **Interactive Statistics**: Every stat card is now tappable and expands a per-habit breakdown. Tap a habit to open its calendar. Tap a Weekly Activity bar to see that day's completion.

### Changed
- New installs start with a single sample habit instead of three with fake streaks.
- Stats are computed from real check-in history (no more stale streak or completion values).
- Weekly Activity measures completion against habits scheduled on each day.
- Identity Shifts shows your actual strongest identity instead of a fixed quote.
- Stat labels renamed to "Done Today" and "Best Streak" to match what they measure.

---
## [1.3.0] - 2026-03-07

### Added
- **Calendar Snapshot Attachments**: Accountability emails now automatically include visual snapshots of your habit calendars.
- **Off-Screen Rendering**: Implemented a "Ghost Renderer" that captures professional-grade snapshots of your progress without interrupting your app experience.
- **Enhanced Reports**: Partners now receive a full visual digest of your consistency and streaks as image attachments.

### Technical
- Updated app version to `1.3.0`.
- Integrated `react-native-view-shot` for programmatic UI capturing.
- Implemented sequential snapshot processing for multi-habit reports.

---
## [1.2.0] - 2026-03-07

---
## [1.1.1] - 2026-03-07
### Added
- **Accountability Partner**: Added ability to associate a friend/partner with each habit.
- **Manual Share Progress**: Added a share button to habit cards to quickly send streaks manually.
- **Minor Version Bump**: Version 1.1.1.

---
## [1.1.0] - 2026-03-07

---
## [1.0.0] - 2026-03-06
- Initial release with core habit tracking, stats, and basic calendar.
