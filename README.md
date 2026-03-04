# Postpartum Tracker for Obsidian

[![GitHub release](https://img.shields.io/github/v/release/cybersader/postpartum-tracker?style=flat-square)](https://github.com/cybersader/postpartum-tracker/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
![Mobile Ready](https://img.shields.io/badge/mobile-ready-green?style=flat-square)
![BRAT Compatible](https://img.shields.io/badge/BRAT-compatible-purple?style=flat-square)

A mobile-first postpartum tracker that lives inside your Obsidian notes. Track feedings, diapers, medications, sleep, pumping, pain, mood, and more -- all stored as markdown-native JSON. Includes smart notifications, Todoist integration, and an extensible tracker library.

## Features

### Core Modules (Baby Care)

- **Feeding tracker** -- Breast (left/right/both) with live timer, side tracking, and time-since-last display
- **Diaper tracker** -- Wet/dirty/both quick buttons, stool color picker with visual swatches, daily count monitoring
- **Medication tracker** -- Configurable medication list with dose timers, risk bars, daily limits, alternating schedule alerts (Tylenol/Ibuprofen), and recovery care items (Dermoplast, Lidocaine, Proctofoam, etc.)

### Tracker Library

Enable additional tracking modules from the library in settings:

| Module | Category | Smart | Description |
|--------|----------|-------|-------------|
| Sleep | Baby development | Yes | Naps and nighttime sleep with start/end timer, location, quality rating |
| Tummy time | Baby development | No | Tummy time sessions with milestone notes |
| Weight | Baby development | No | Periodic weight measurements |
| Height/length | Baby development | No | Length measurements |
| Head circumference | Baby development | No | Head circumference measurements |
| Temperature | Baby development | Yes | Temperature readings with method (rectal, axillary, temporal, oral) |
| Pain tracking | Mother's recovery | No | Pain level (1-10), location, type |
| Bowel movements | Mother's recovery | Yes | Postpartum bowel movement tracking (24h reminder) |
| Restroom visits | Mother's recovery | No | Urination frequency tracking |
| Walking/activity | Mother's recovery | No | Walks with duration timer |
| Pumping sessions | Mother's recovery | Yes | Pump tracking with side, amount, and timer |
| Feeding position | Mother's recovery | No | Breastfeeding position logging |
| Mood check-in | General | Yes | Mood rating and emotional state tracking |

**Smart** modules support automatic interval-based reminders via the notification system.

### Notifications

- **In-app toast** notifications with snooze and dismiss
- **System notifications** (desktop, Web Notification API)
- **Webhooks** for external services (Gotify, ntfy.sh, etc.)
- Configurable check interval, feeding reminders, medication dose alerts, alternating med schedule alerts
- Library tracker reminders (sleep, pumping, bowel movements, mood, etc.)

### Todoist Integration

- **Proactive tasks** -- After logging a feeding, creates "Check if baby is hungry" with estimated time
- **Alert tasks** -- Creates tasks when notifications fire
- **Two-way sync** -- Completing tasks in Todoist creates entries in the tracker
- Configurable project, sections, priorities, labels, due date style

### Widget Features

- **Baby info bar** -- Name, day of life, weeks display
- **Daily summary dashboard** -- At-a-glance cards for all enabled modules
- **Quick action buttons** -- One-tap logging for everything
- **Past-time clock** -- Log entries for earlier times
- **Collapsible, reorderable sections** -- Drag or arrow buttons to reorganize
- **Health alerts panel** -- Feeding overdue, low diaper count, custom alerts
- **Inline editing** -- Edit any entry's time, fields, and notes

## Quick Start

1. Install via [BRAT](https://github.com/TfTHacker/obsidian42-brat) using `cybersader/postpartum-tracker`
2. Open any note and run the command **Insert postpartum tracker** (or click the ribbon icon)
3. Start tracking!

The plugin creates a `postpartum-tracker` code block:

````markdown
```postpartum-tracker
{"version":1,"meta":{},"layout":["feeding","diaper","medication"],"trackers":{"feeding":[],"diaper":[],"medication":[],"medicationConfig":[...],"logNotes":[]}}
```
````

## Settings

### Display
- Time format (12h/24h)
- Haptic feedback (mobile)

### Tracker Library
- Enable/disable any tracking module
- Core modules marked with `[core]` badge
- Smart modules marked with `[smart]` badge

### Feeding
- Show live timer
- Track breast side

### Diapers
- Show color picker for dirty diapers
- Wet diaper alert threshold

### Medication & Recovery Care
- Pre-configured medications (Tylenol, Ibuprofen, Norco, supplements)
- Pre-configured remedies (Dermoplast, Lidocaine, EMLA, Proctofoam, Witch hazel)
- Add custom medications and remedies
- Edit dosage, intervals, daily limits, icons

### Notifications
- Enable/disable, notification type (in-app, system, both)
- Check interval, feeding reminder threshold
- Medication dose ready alerts
- Alternating medication schedule alerts
- Webhook URL and test button

### Todoist
- API token, project setup
- Create on alert / create on log toggles
- Due date style, priorities, labels, task prefix
- Suppress toasts, two-way sync

## Installation

### BRAT (Recommended)
1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Community Plugins
2. BRAT Settings > Add Beta Plugin > `cybersader/postpartum-tracker`
3. Enable "Postpartum tracker" in Community Plugins

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/cybersader/postpartum-tracker/releases)
2. Create `<vault>/.obsidian/plugins/obsidian-postpartum-tracker/`
3. Copy the three files into that folder
4. Enable the plugin in Settings > Community Plugins

## Development

```bash
bun install          # Install dependencies
bun run dev          # Watch mode
bun run build        # Production build (type check + bundle)
```

### Architecture

- **TrackerModule interface** -- Each module implements `buildUI()`, `computeStats()`, `getQuickActions()`, `tick()`, `getAlerts()`
- **SimpleTrackerModule** -- Generic module class instantiated from data-driven definitions (no custom code per tracker)
- **TrackerRegistry** -- Central module registry, iterated by the widget
- **CodeBlockStore** -- JSON persistence in markdown code blocks via `ctx.getSectionInfo()` + `app.vault.process()`
- **NotificationService** -- Plugin-level periodic scanner with multi-channel dispatch
- **TodoistService** -- Todoist API v1 integration with task lifecycle management

### Releasing

```bash
scripts/release.sh 0.2.0    # Bumps version, tags, pushes -> GitHub Actions creates release
```

## Inspired By

- [Baby Buddy](https://github.com/babybuddy/babybuddy) -- Open-source baby tracking (sleep, tummy time, pumping, measurements, temperature)
- [Obsidian Contractions Timer](https://github.com/cybersader/obsidian-contractions-timer) -- Same architecture pattern

## License

MIT
