# Changelog

All notable changes to the Postpartum Tracker plugin are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.1] - 2026-03-04

### Changed

- Toggling trackers in the library settings now applies immediately without a plugin reload.
- Registry is rebuilt and all open widgets refresh automatically on setting change.

## [0.4.0] - 2026-03-04

### Added

- Astro Starlight documentation site with 13 pages (Getting Started, Guides, Advanced).
- GitHub Actions workflow for auto-deploying docs to GitHub Pages.
- Docs site live at `https://cybersader.github.io/postpartum-tracker/`.

### Changed

- README redesigned with docs site link, tighter feature tables, and documentation section.

## [0.3.0] - 2026-03-04

### Added

- Todoist cleanup: "Remove project from Todoist" and "Clear local task cache" buttons in settings.
- Debug logging for Todoist workspace fetch.
- Code block scope and data locality documentation in knowledge base.

### Fixed

- Todoist project lookup now matches by name AND workspace ID, preventing collisions between personal and team projects with the same name.
- `TrackedTask.category` type widened to `string` to support library tracker IDs.

## [0.2.1] - 2026-03-04

### Added

- Team workspace support for Todoist: dropdown to select a shared workspace so the project is visible to all team members.
- `workspaceId` field in Todoist settings.
- `fetchWorkspaces()` API method.

## [0.2.0] - 2026-03-04

### Added

- **Tracker library system**: 14 data-driven tracker modules (sleep, tummy time, weight, height, head circumference, temperature, pain, bowel movements, restroom, walking, pumping, feeding position, mood, hiccups).
- `SimpleTrackerModule` class: single generic module instantiated per definition, with dynamic form generation, duration timers, stats, and notifications.
- `SimpleTrackerDef` and `SimpleTrackerField` type system for data-driven tracker definitions.
- Quick-select UI: modules with a select field (4 or fewer options) get per-option quick-action buttons.
- Library browser in settings organized by category (baby development, mother's recovery, general) with smart/core badges.
- Notification support for smart library trackers (interval-based reminders).
- Todoist integration for `simple-logged` events.
- Knowledge base with 5 reference docs (architecture, tracker module guide, simple tracker guide, notification system, Todoist integration).
- README with feature tables, installation instructions, and architecture overview.
- Git repository, CI/CD pipeline, BRAT-compatible releases.
- `version-bump.mjs` and `scripts/release.sh` for automated releases.

### Fixed

- Medication editor in settings now appears inline below the item instead of at the bottom of the settings pane.
- `CodeBlockStore.parse()` preserves arbitrary tracker keys (library module data no longer silently dropped).

## [0.1.0] - 2026-03-04

### Added

- Initial release.
- Feeding tracker: breast (left/right/both) with live timer, bottle feeding, side tracking.
- Diaper tracker: wet/dirty/both quick buttons, stool color picker with visual swatches.
- Medication tracker: configurable medication list, dose timers, risk bars, daily limits, alternating schedule alerts.
- Pre-configured medications (Tylenol, Ibuprofen, Norco, supplements) and recovery remedies (Dermoplast, Lidocaine, EMLA, Proctofoam, Witch hazel).
- Baby info bar with name, day of life, and weeks display.
- Daily summary dashboard.
- Quick action buttons for one-tap logging.
- Past-time clock for logging earlier entries.
- Collapsible, reorderable sections (drag and arrow buttons).
- Health alerts panel (feeding overdue, low diaper count).
- Inline editing for entries.
- Notification system: in-app toasts, system notifications, webhooks.
- Todoist integration: proactive tasks, alert tasks, two-way sync.
- Data stored as JSON inside markdown code blocks.
- Mobile-first design with haptic feedback.

[Unreleased]: https://github.com/cybersader/postpartum-tracker/compare/0.4.1...HEAD
[0.4.1]: https://github.com/cybersader/postpartum-tracker/compare/0.4.0...0.4.1
[0.4.0]: https://github.com/cybersader/postpartum-tracker/compare/0.3.0...0.4.0
[0.3.0]: https://github.com/cybersader/postpartum-tracker/compare/0.2.1...0.3.0
[0.2.1]: https://github.com/cybersader/postpartum-tracker/compare/0.2.0...0.2.1
[0.2.0]: https://github.com/cybersader/postpartum-tracker/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/cybersader/postpartum-tracker/releases/tag/0.1.0
