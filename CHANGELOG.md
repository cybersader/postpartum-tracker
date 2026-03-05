# Changelog

All notable changes to the Postpartum Tracker plugin are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.12.0] - 2026-03-05

### Added

- **Timer animation color**: Choose the color for all timer animations — accent (theme default), red alert, green glow, blue pulse, or a custom color via color picker.
- Custom color picker appears when "Custom color" is selected.

### Changed

- **Pulse animation strengthened**: Pulse now includes a visible scale transform (1.06x) and larger glow (16px spread) in addition to opacity fade. Much more noticeable on mobile.
- All timer animations (pulse, blink, flash, bounce, glow) now use the configured timer color instead of always using the theme accent color.
- Fixed duplicate `@keyframes pt-pulse` that was overriding the enhanced version with a simpler opacity-only variant.

## [0.11.0] - 2026-03-05

### Fixed

- **Past-clock with duration trackers**: Tapping a duration-based simple tracker (e.g., Sleep, Tummy time) while the past clock is active now opens a completed-entry form with a duration field instead of starting a live timer from the past time.
- **Past-clock with quick-select duration trackers**: Same fix for quick-select option buttons on duration trackers — routes to a pre-filled form instead of a live timer.

### Added

- **Flash timer animation**: Hard on/off color toggle (0.8s cycle) — very obvious active-timer indicator.
- **Bounce timer animation**: Scale pulse with glow (1s cycle) — attention-grabbing active-timer indicator.
- Timer animation dropdown now has 6 options: pulse, blink, glow, solid, flash, bounce.

## [0.10.0] - 2026-03-05

### Added

- **Event history feed**: Unified chronological feed of all recent entries from all modules, shown below the tracker sections. Displays entries newest-first with edit and delete buttons that route to the owning module.
- **Undo last button**: One-tap undo for the most recent entry (e.g., accidental button presses).
- **Show event history** toggle in General > Display settings (on by default).

## [0.9.0] - 2026-03-05

### Added

- **Hold-for-details on quick actions**: Long-press (~500ms) any quick-action button to open a detail form before logging. Tap still logs instantly.
  - **Feeding**: Hold Left/Right/Both to add notes before starting the timer. Hold the Stop button to edit side, duration, and notes on finish.
  - **Diapers**: Hold Wet/Dirty/Both to open a form with time, stool color, description, and notes.
  - **Simple trackers**: Hold no-field trackers (e.g., Hiccups) to add notes. Hold quick-select trackers to open the full form with the option pre-filled.
- **Show bottle button** toggle: New setting under Feeding to show or hide the bottle quick-action button.
- Visual indicator (subtle bar) on buttons that support long-press.

### Fixed

- **Diaper color picker ignoring modal mode**: Dirty diaper color/description prompt now opens as a modal when input mode is set to modal, instead of always using the inline picker.

## [0.8.0] - 2026-03-05

### Added

- **Rolling entry window**: Entry lists now show the last 24 hours by default instead of cutting off at midnight. Late-night feedings, diapers, and meds stay visible after midnight.
- **Entry list window setting**: Configurable in General > Display. Options: today only (midnight cutoff), 12h, 24h, or 48h rolling window.

## [0.7.5] - 2026-03-05

### Fixed

- **Birth date off by one day**: Editing birth date showed the previous day (e.g., Feb 26 → Feb 25) because `new Date("YYYY-MM-DD")` parses as UTC midnight, which shifts back a day in US timezones. Date-only strings are now passed through without UTC conversion.

## [0.7.4] - 2026-03-05

### Added

- **iOS alarm gap callout**: Notification settings now explain that no current service combines scheduled offline delivery AND alarm-loop on iOS, with workaround guidance.

## [0.7.3] - 2026-03-05

### Fixed

- **Double-fire on all module buttons**: Extended the `handledByPointer` guard to SimpleTrackerModule, InlineEditPanel, and FieldRenderer. Feeding position, pain rating, and all other simple tracker modals no longer pop in and immediately dismiss on mobile tap.

## [0.7.2] - 2026-03-05

### Changed

- **Notification platform table**: Reorganized into three sections — "While Obsidian is open", "Obsidian in background", and "Obsidian fully closed" — so users can see exactly which services work in each state.
- **ntfy guide streamlined**: Setup instructions shortened and consolidated; removed verbose separate sections for iOS limitations and offline reliability.
- ntfy setting label corrected to "Keep alerting" (matches actual ntfy app UI).

## [0.7.1] - 2026-03-05

### Added

- **Multi-service notifications**: ntfy, Pushover, Gotify, and custom webhooks can all be enabled simultaneously. Shared vaults can have one user on ntfy (Android) and another on Pushover (iOS) receiving alerts at the same time.
- Per-service enable toggles with individual test buttons.
- Auto-migration from old single-preset model to new per-service toggles.

### Changed

- Notification settings reorganized from a single dropdown to collapsible per-service sections.
- Combo guide updated with shared-vault advice.

### Fixed

- **Button double-fire on mobile**: Quick-action buttons (pain tracking, etc.) no longer fire twice on tap. The `pointerup` + `click` event pattern now guards against double-invocation, preventing inline edit panels from appearing then immediately dismissing.

## [0.7.0] - 2026-03-05

### Added

- **Pushover integration**: New webhook preset for iOS + Android alarm-style notifications. Emergency priority (priority=2) retries every 60 seconds until acknowledged. Supports iOS Critical Alerts that bypass DND and silent mode. $4.99 one-time purchase.
- **Pushover settings UI**: App token and user key inputs with comprehensive setup guide covering iOS Critical Alerts, Android alarm configuration, and pricing.
- **Scheduled ntfy reminders**: When you log a feeding or medication dose, the plugin immediately schedules a future ntfy notification at the expected next reminder time using ntfy's server-side `In:` header. Works even after closing Obsidian.
- **Schedule reminders on log** toggle in notification settings.
- **ntfy emoji tags**: Notifications include category-specific emoji tags (baby bottle, pill, baby, warning, rotating light).
- **Summary bar controls**: Master toggle to show/hide the daily summary bar, position selector (top, bottom, after buttons), and per-module opt-in checkboxes. All modules hidden by default.
- **Live settings refresh**: Changing any setting immediately re-renders all open tracker widgets without needing to reload the plugin.
- **Status bar manager**: Live context display in Obsidian status bar showing active timer info.
- **Modal edit panel**: Edit tracker entries in a centered Obsidian modal with rich, tappable field components.
- **Field renderer**: Shared rich input component system (color pickers, toggle chips, duration wheels, sliders) used by both inline and modal edit panels.
- **History modal**: View past tracker entries grouped by day.
- **Export service**: Export tracker data to Markdown tables or CSV.
- **URI handler**: `obsidian://postpartum-tracker` protocol handler for external automation (iOS Shortcuts, Tasker).
- **Quick-action commands**: Palette commands for common tracker actions.
- **Field timing (`collectOn`)**: Tracker fields can specify when to collect data — on start, stop, log, or always.
- **Medication descriptions**: All default medications and remedies now include brief descriptions of what they're for.
- **Feeding reminder override**: Manual override for feeding reminder interval (0 = use age-based dynamic value).
- **Button size and timer animation** settings (compact/normal/large, pulse/blink/glow/solid).
- **Platform support table** in notification settings showing feature availability across Desktop, Android, and iOS.
- **Alarm setup guide** documentation page.

### Changed

- Default ntfy topic prefix changed from `baby-tracker-` to `pptracker-`.
- Summary bar now defaults to hidden (opt-in instead of opt-out).
- `hiddenSummaryModules` replaced with `visibleSummaryModules` allowlist (empty by default).
- Webhook preset selector now includes ntfy, Gotify, Pushover, and Custom options.
- Notification settings completely reorganized with collapsible guides, platform table, and combo setup recommendations.
- Registry rebuild now refreshes widgets in-place instead of rewriting code block JSON.
- Inline edit panel refactored to use shared FieldRenderer.

### Fixed

- Settings changes no longer require plugin reload to take effect in the tracker UI.
- Feeding tracker field collection timing improved for duration-based entries.

## [0.6.0] - 2026-03-04

### Added

- **Tabbed settings UI**: Settings organized into 3 tabs (Trackers, Notifications, General) for easier navigation.
- **Logic packs**: Configurable milestone rule sets that define expected outcomes by day of life. 3 built-in packs: "First week newborn", "Postpartum recovery", "Breastfeeding establishment".
- **Milestone evaluator**: Compares actual tracker data against logic pack expectations and surfaces alerts/progress.
- **Library tracker editing**: Pencil button on each library tracker to customize display name, icon, and notification settings without affecting the underlying definition.
- **Custom tracker builder**: Create your own trackers directly from settings with name, icon, description, category, duration toggle, and dynamic field definitions.
- **Emoji picker modal**: Searchable emoji picker using Obsidian's native fuzzy suggest modal (~200 emojis with keyword search) plus curated quick-pick grid.
- **Medication reconciliation**: Plugin automatically adds new default medications/remedies on load so existing users get new items without losing their customizations.
- 4 new library trackers: Bleeding/lochia, Skin-to-skin, Cord care, Hiccups.
- 10+ new default medications/remedies: Nipple cream, Sitz bath, Perineum ice pack, Hemorrhoid cream, Breast ice/heat pack, Naproxen, Colace, Miralax, Peri bottle, Hydrocodone-Acetamin.
- `[core]`, `[smart]`, `[duration]`, `[custom]`, `[logic pack]` badges in tracker library browser.
- Category filter chips and fuzzy search in tracker library browser.

### Changed

- Medication defaults updated: Ibuprofen 800mg/8h, Stool softener 12h intervals, Prenatal vitamin 2 gummies, Iron 324mg/48h.
- Quick-action button labels now wrap to 2 lines instead of truncating to nothing.
- Select-option quick buttons (e.g., pumping left/right) show parent module name as sublabel.
- Library tracker toggles now rebuild registry immediately (no more "Reload plugin" notice).

### Removed

- "Perineal care" tracker (redundant -- individual items exist as remedies: Sitz bath, Ice pack, Dermoplast, Peri bottle, etc.).

### Fixed

- Mobile quick-action button grid overflow on phones < 375px wide.
- Recovery care section appearing empty for existing users (medication reconciliation now backfills missing items).
- Medications saved before `category` field was added now get correct category assignment.

## [0.5.0] - 2026-03-04

### Fixed

- Todoist workspace (team) detection now uses the Sync API instead of a non-existent REST endpoint. The "Raders" team and other workspaces should now appear in the dropdown.

### Added

- 6 developer commands (visible when "Enable debug log" is on in settings):
  - `[Dev] Fetch Todoist workspaces` -- test workspace/team detection
  - `[Dev] List Todoist projects` -- show all visible projects
  - `[Dev] Force notification check` -- trigger an immediate alert scan
  - `[Dev] Rebuild tracker registry` -- re-register modules and refresh widgets
  - `[Dev] Dump settings to console` -- inspect current settings in dev console
  - `[Dev] Clear Todoist debug log` -- reset the debug log file

### Changed

- `NotificationService.check()` made public for debug command access.

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

[Unreleased]: https://github.com/cybersader/postpartum-tracker/compare/0.12.0...HEAD
[0.12.0]: https://github.com/cybersader/postpartum-tracker/compare/0.11.0...0.12.0
[0.11.0]: https://github.com/cybersader/postpartum-tracker/compare/0.10.0...0.11.0
[0.10.0]: https://github.com/cybersader/postpartum-tracker/compare/0.9.0...0.10.0
[0.9.0]: https://github.com/cybersader/postpartum-tracker/compare/0.8.0...0.9.0
[0.8.0]: https://github.com/cybersader/postpartum-tracker/compare/0.7.5...0.8.0
[0.7.5]: https://github.com/cybersader/postpartum-tracker/compare/0.7.4...0.7.5
[0.7.4]: https://github.com/cybersader/postpartum-tracker/compare/0.7.3...0.7.4
[0.7.3]: https://github.com/cybersader/postpartum-tracker/compare/0.7.2...0.7.3
[0.7.2]: https://github.com/cybersader/postpartum-tracker/compare/0.7.1...0.7.2
[0.7.1]: https://github.com/cybersader/postpartum-tracker/compare/0.7.0...0.7.1
[0.7.0]: https://github.com/cybersader/postpartum-tracker/compare/0.6.0...0.7.0
[0.6.0]: https://github.com/cybersader/postpartum-tracker/compare/0.5.0...0.6.0
[0.5.0]: https://github.com/cybersader/postpartum-tracker/compare/0.4.1...0.5.0
[0.4.1]: https://github.com/cybersader/postpartum-tracker/compare/0.4.0...0.4.1
[0.4.0]: https://github.com/cybersader/postpartum-tracker/compare/0.3.0...0.4.0
[0.3.0]: https://github.com/cybersader/postpartum-tracker/compare/0.2.1...0.3.0
[0.2.1]: https://github.com/cybersader/postpartum-tracker/compare/0.2.0...0.2.1
[0.2.0]: https://github.com/cybersader/postpartum-tracker/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/cybersader/postpartum-tracker/releases/tag/0.1.0
