# Changelog

All notable changes to the Postpartum Tracker plugin are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.19.5] - 2026-03-11

### Fixed

- **Heatmap legend shows meaningful units**: Feeding legend now shows "0 feeds/hr" to "1 feed/hr" instead of bare "0" to "1". Sleep legend shows "0m" to "39m/hr" to clarify cells represent per-hour values.

## [0.19.4] - 2026-03-11

### Fixed

- **Weekly averages ignore empty days**: `collapseToWeeks` and `aggregateWeekly` now divide by days with actual data, not total days in the chunk. A week with 2 days of 9h sleep correctly shows ~9h/day, not ~2.6h/day.

## [0.19.3] - 2026-03-11

### Fixed

- **Heatmap filters out empty rows**: Weeks/days with zero data are removed entirely instead of showing "0m/day" rows. Only rows with actual logged data appear.
- **Avg row only averages active rows**: The average summary no longer gets diluted by empty weeks (e.g., 9h9m/day instead of 42m/day when only 1 of 13 weeks has data).

## [0.19.2] - 2026-03-11

### Changed

- **Heatmap row totals show per-day averages**: Sleep rows show "3h12m/day", feeding rows show "10/day". Legend drops "/hr" suffix — just shows the value range.

## [0.19.1] - 2026-03-11

### Changed

- **Heatmap shows specific values**: Legend shows actual units (e.g., "0" to "45m/hr") instead of generic "Less"/"More". Each row shows daily total on right (e.g., "3h12m" for sleep, "10/day" for feedings). Avg row also shows its total.
- **Sleep heatmap cell values in minutes**: Legend scale uses minutes format for clarity.

## [0.19.0] - 2026-03-11

### Fixed

- **3mo sleep bars unreadable**: 3mo view now uses weekly-aggregated bars again (W1, W2...) instead of 90 compressed daily bars. 1mo still shows daily bars with 7-day moving average.
- **Period ranking shows hours + minutes**: "0.2h avg" is now "12m avg" or "1h 30m avg" — much more readable.
- **Averages ignore empty days**: Period ranking and insights now divide by days with actual data, not total window days. Shows "Data from X of Y days" when there are gaps.
- **X-axis label crowding**: Adaptive label skipping for charts with many bars (shows ~10 labels max regardless of bar count).

## [0.18.9] - 2026-03-11

### Added

- **Heatmap average row**: Weekly heatmaps (feeding & sleep at 1mo+) now show an "Avg" summary row at the bottom — a gradient bar averaging all weeks' hourly profiles into one row.

## [0.18.8] - 2026-03-11

### Changed

- **Sleep analytics monthly views**: Show daily bars with 7-day moving average overlay instead of weekly-aggregated bars. Gives both daily granularity and weekly trend at 1mo/3mo windows. Value labels hidden at monthly scale to reduce clutter.

## [0.18.7] - 2026-03-11

### Changed

- **Date labels for 2w+ views**: Bar chart x-axis now shows M/D format (e.g., 3/1, 3/2) instead of repeating day names (Thu, Fri... Thu, Fri) which were ambiguous across multiple weeks.
- **Label thinning**: Charts with >10 bars skip every other x-axis label to prevent crowding, always showing first and last.
- **Heatmaps collapse to weekly rows**: At 1mo+ windows, heatmaps now show W1, W2, W3... rows (weekly averages) instead of day-of-week, preserving progression over time.

## [0.18.6] - 2026-03-11

### Changed

- **Weekly aggregation for large windows**: At 1mo+ windows, all bar charts switch from daily bars to weekly averages (W1, W2, ...) so the data is readable instead of 90 compressed slivers. Applies to all 4 analytics modules.
- **Heatmap collapses to day-of-week**: At 1mo+ windows, feeding and sleep heatmaps show Mon-Sun rows (averaged across weeks) instead of 30-90 individual day rows. Title changes to "Sleep by day of week" / "Feedings by day of week".
- **Stacked charts aggregate correctly**: Nursing minutes L/R/Both, diaper wet/dirty, and medication dose stacks all properly average per-segment when aggregating weekly.

## [0.18.5] - 2026-03-11

### Changed

- **Bigger window picker pills**: Increased font size (11px → 14px), padding, and border radius for easier tapping on mobile.
- **More window options**: Analytics pills now offer 3d, 1w, 2w, 1mo, 3mo (was just 3d/7d/14d). View up to 3 months of trends at a glance.

## [0.18.4] - 2026-03-11

### Fixed

- **All charts now width-adaptive**: Removed fixed pixel heights from BarChart, TimelineChart, HeatmapChart, and ActivityProfile. Charts now scale naturally with container width via SVG viewBox ratio — no more squished/narrow rendering.
- **Smoothed activity profile curve**: Activity profile now uses Gaussian-weighted moving average (circular, wraps around midnight) instead of raw point-to-point. Produces a smooth, professional waveform that reveals true patterns without noise.

## [0.18.3] - 2026-03-11

### Fixed

- **Activity profile chart too small**: Increased chart height from 64px to 120px, enlarged viewBox proportions, bigger font for peak label and hour labels. Chart now renders at a readable size.

## [0.18.2] - 2026-03-11

### Added

- **Activity profile charts**: New "Average sleep by hour" and "Average feedings by hour" area charts that collapse the heatmap into a single 24-hour curve showing average activity by hour of day. Annotates the peak hour automatically (e.g. "most sleep 2am", "busiest 7pm").

## [0.18.1] - 2026-03-11

### Added

- **Heatmaps**: New hour-of-day heatmap charts for both feeding and sleep analytics. Shows activity density across all 24 hours for each day in the window — brighter cells mean more activity. Useful for spotting cluster patterns and schedule drift.
- **Analytics docs page**: New documentation page at the docs site covering all analytics features, chart types, heatmaps, window pickers, and parent sleep window setup.

### Changed

- **Sleep period ranking uses averages**: "Sleep by time of day" now shows average hours per day instead of summed totals, making the ranking meaningful across different window sizes.

## [0.18.0] - 2026-03-11

### Added

- **Sleep period ranking**: New "Sleep by time of day" chart shows which 6-hour period (Night, Morning, Afternoon, Evening) has the most baby sleep, ranked with horizontal bars.
- **Parent sleep window**: New setting (Settings > Trackers > Sleep) to define your target sleep hours (e.g. 10pm-6am). When enabled:
  - Timeline shows a green background band for the parent sleep window
  - Baby sleep blocks during your window are colored green, outside stays purple
  - New insight: "Baby slept X% of your sleep window" with positive/neutral/negative coloring
- **Timeline background bands**: TimelineChart now supports semi-transparent background bands for any overlay (used by parent sleep window).

### Changed

- **Analytics toggles consolidated**: All 4 analytics enable toggles now live in one "Analytics" section at the top of the Trackers tab, instead of being scattered under individual tracker sections.

## [0.17.2] - 2026-03-11

### Changed

- **"Both" feeding button hidden by default**: New installs no longer show the "Both" breast button. Existing users are unaffected (their saved config is preserved). Can be re-enabled in Settings > Trackers > Feeding > Both button.

## [0.17.1] - 2026-03-11

### Changed

- **Smart per-module analytics windows**: Each analytics section now has inline pill buttons (3d / 7d / 14d) to change the time window right where you're viewing the charts. No more single global dropdown.
- **Smart defaults by baby age**: Analytics default to 3 days for babies < 1 week, 7 days for 1-2 weeks, 14 days for 2+ weeks.
- **Per-module persistence**: Window choices are saved per analytics section in the code block data, so different sections can show different time ranges.
- **Analytics toggles moved to tracker settings**: Enable feeding analytics under Feeding, diaper analytics under Diapers, etc. — no longer buried in General settings.
- **Fixed charts unaffected**: Timelines stay at 3 days, "today" insights stay today, pain coverage stays 24h. Only bar charts, sparklines, and trend arrows change with the picker.

### Fixed

- **CodeBlockStore preserves logicPackId**: Pre-existing bug where `logicPackId` in code block data was silently dropped on parse. Now preserved.

## [0.17.0] - 2026-03-11

### Added

- **Analytics dashboard with SVG charts**: Four new collapsible analytics sections showing trends, patterns, and insights for feeding, sleep, diapers, and medications. All charts are pure SVG (zero dependencies) and theme-aware.
  - **Feeding analytics**: Feedings per day (bar chart with 3-day moving average), nursing minutes by side (stacked L/R/Both), time-of-day timeline, L/R balance bar, avg session sparkline, and insights (avg feedings/day, session duration, longest gap, next side suggestion).
  - **Sleep analytics**: Total sleep hours and session count per day, sleep timeline, longest stretch sparkline, and insights (total today, longest stretch, avg awake window, trend, age-appropriate context).
  - **Diaper analytics**: Wet/dirty stacked bar chart, change times dot plot, and insights (today's counts, day-of-life adequacy targets, stool color trend, volume trend).
  - **Medication analytics**: Doses per day by medication (stacked with color legend), dose timing timeline, and insights (pain coverage hours, per-med average gap vs target, today's dose count).
- **Analytics settings**: Toggle each analytics module on/off and choose analysis window (3, 7, or 14 days) under Settings > General > Analytics.
- **Analytics sections are reorderable**: Drag or use move arrows to position analytics sections anywhere in the layout.

### Fixed

- **Sleep notification timing**: "Baby awake" reminder now measures from sleep END time (when baby woke up) instead of sleep START time. Previously the alert fired too early because it measured from when the baby fell asleep.

## [0.16.2] - 2026-03-07

### Fixed

- **Library tracker reminder overrides ignored**: Disabling "Reminder enabled" in a library tracker's settings (e.g., Sleep) had no effect — notifications still fired. The notification service was only checking the library definition's default, not the user's per-tracker override. Now checks `libraryTrackerOverrides[id].notification.reminderEnabled` and also uses the overridden interval if set.

## [0.16.1] - 2026-03-07

### Added

- **Suppress in-app toasts when external push is active**: New toggle under Push notification services. When enabled and any push service (ntfy, Pushover, Gotify, or custom webhook) is active, in-app toast popups are hidden — notifications go only through the external service. Works independently of the Todoist suppress toggle.

## [0.16.0] - 2026-03-07

### Added

- **Delete confirmation modal**: Tapping the delete button (or undo in event history) now shows a confirmation dialog before removing the entry. Prevents accidental data loss from mis-taps while scrolling on mobile.
- **Per-medication notification controls**: Each medication now has a bell toggle in settings to enable/disable dose-ready and alternating-schedule notifications individually. Disabling notifications for a specific med (e.g., Hydrocodone) no longer requires disabling all medication alerts.

### Fixed

- **Data corruption from sync conflicts**: Fixed corrupted JSON entries (missing comma/field name, duplicate keys) likely caused by Obsidian Sync auto-merge.

## [0.15.6] - 2026-03-05

### Fixed

- **Modals immediately closing on mobile**: Edit modals would "pop up and then go away" because mobile browsers synthesize delayed mouseup/click events ~300ms after a touch. The unhandled mouseup propagated to Obsidian's document-level modal backdrop listener, triggering an immediate close. Fix: defer modal opening to the next animation frame via `requestAnimationFrame` and block all delayed synthetic mouse events (mousedown + mouseup) from propagating.

## [0.15.5] - 2026-03-05

### Fixed

- **Edit/action buttons firing twice on mobile**: The 300ms tap-to-click delay caused handler double-fire. The `handledByPointer` flag now stays active for 400ms, and mousedown/mouseup handlers block delayed synthetic events from propagating to document-level listeners. Fixed across all button handler files.

## [0.15.4] - 2026-03-05

### Changed

- **Recent activity is now a first-class section**: The event history feed is now a collapsible, reorderable section like all other tracker modules. It participates in the layout system with move arrows and drag-to-reorder, so you can position it anywhere among your sections.
- Entry icons (module emojis) are visible on each row in the activity feed.

## [0.15.3] - 2026-03-05

### Fixed

- **Data corruption race condition**: Todoist entry injection (`writeEntryToVault`) now uses atomic `vault.process()` instead of non-atomic `cachedRead` + `vault.modify`. Previously, if a Todoist task completed at the same time as a timer stopped, the two concurrent writes could produce malformed JSON, breaking all data loading.
- **Parse error logging**: Corrupted code block JSON now logs an error to the console instead of silently returning empty data.

## [0.15.2] - 2026-03-05

### Fixed

- **ntfy JSON publishing**: POST to ntfy server root (`https://ntfy.sh`) with `topic` in JSON body instead of posting JSON to the topic URL. ntfy was interpreting the JSON body as a plain text message, causing raw JSON to display as the notification content. Affects both immediate and scheduled (delayed) notifications.

## [0.15.1] - 2026-03-05

### Fixed

- **Entry list ordering**: All entry lists now show newest entries at the top instead of oldest first.
- **Day separator headers**: Entry lists show "Today", "Yesterday", or formatted date headers between entry groups.
- **ntfy notifications**: Fixed ntfy payloads — removed `extras` object and duplicate `topic` field that caused display issues. ntfy now receives only the fields it understands (title, message, priority, tags).
- **Gotify notifications**: Gotify now gets its own dedicated sender with the correct payload format and auto-appended `/message` endpoint.
- **Custom webhook**: Cleaned up generic webhook payload to include flat `level`, `category`, `plugin` fields instead of nested `extras`.

## [0.15.0] - 2026-03-05

### Added

- **NLP quick entry**: Optional text input at top of the widget for natural language logging. Type phrases like "fed left 20 min", "wet diaper", "took ibuprofen at 3pm", or "napped 45m" and the parser shows a preview before confirming.
- Rules-based parser with zero dependencies — matches feeding, diaper, medication, sleep, and 10+ simple tracker types by keyword.
- Extracts duration ("20 min", "1.5 hours"), volume ("4oz", "120ml"), time modifiers ("at 3pm", "30 min ago"), and medication names.
- Confidence indicator: green (high), yellow (medium), red (low) border on preview.
- Unmatched text falls back to the comments tracker when enabled.
- `addEntry()` method on all tracker modules for programmatic entry creation.
- Enable via Settings > General > Display > "Quick entry".

## [0.14.0] - 2026-03-05

### Added

- **Notes & comments tracker**: New built-in module for free-text timestamped notes with category support (general, concern, milestone, reminder). Enable it from the tracker library.
- "Add note" quick-action button opens a form with time, category, and text fields.
- Edit and delete support for comment entries.
- Library browser now shows module-specific icons and descriptions for all built-in modules.

## [0.13.0] - 2026-03-05

### Added

- **Core tracker button configurability**: Per-button visibility toggle, custom label, and custom icon for all feeding (left/right/both/bottle), diaper (wet/dirty/both), and medication buttons.
- **Hold-for-details toggle**: Each core tracker (feeding, diaper, medication) now has a setting to enable/disable the long-press detail form. Medication long-press opens a notes form when enabled.
- **Feeding position field**: Optional breastfeeding position selector (cradle, cross-cradle, football, side-lying, laid-back) shown in the long-press detail form when enabled.
- Settings UI sections for button customization under each tracker heading.

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
