# Postpartum Tracker for Obsidian

[![GitHub release](https://img.shields.io/github/v/release/cybersader/postpartum-tracker?style=flat-square)](https://github.com/cybersader/postpartum-tracker/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
![Mobile Ready](https://img.shields.io/badge/mobile-ready-green?style=flat-square)
![BRAT Compatible](https://img.shields.io/badge/BRAT-compatible-purple?style=flat-square)
[![Docs](https://img.shields.io/badge/docs-starlight-c2649a?style=flat-square)](https://cybersader.github.io/postpartum-tracker/)

A mobile-first postpartum tracker that lives inside your Obsidian notes. Track feedings, diapers, medications, sleep, pumping, pain, mood, and more -- all stored as markdown-native JSON.

<!-- TODO: Add screenshot here -->
<!-- ![Screenshot](docs/src/assets/screenshot.png) -->

## Features

### Core tracking

| Module | Highlights |
|--------|-----------|
| **Feeding** | Breast (L/R/both) with live timer, bottle feeding, side tracking, time-since-last |
| **Diapers** | Wet/dirty/both quick buttons, stool color picker, daily count alerts |
| **Medication** | Configurable med list, dose timers, risk bars, daily limits, Tylenol/Ibuprofen alternating alerts, recovery care items |

### 14+ library trackers

Enable additional modules in settings -- no custom code needed.

| Module | Category | Smart | Duration |
|--------|----------|:-----:|:--------:|
| Sleep | Baby development | Yes | Yes |
| Tummy time | Baby development | | Yes |
| Weight | Baby development | | |
| Height/length | Baby development | | |
| Head circumference | Baby development | | |
| Temperature | Baby development | Yes | |
| Pain tracking | Mother's recovery | | |
| Bowel movements | Mother's recovery | Yes | |
| Restroom visits | Mother's recovery | | |
| Walking/activity | Mother's recovery | | Yes |
| Pumping sessions | Mother's recovery | Yes | Yes |
| Feeding position | Mother's recovery | | |
| Mood check-in | General | Yes | |
| Hiccups | General | | Yes |

**Smart** = automatic interval-based reminders. **Duration** = start/stop timer.

### Notifications

In-app toasts, system notifications, and webhooks (Gotify, ntfy.sh). Feeding reminders, medication dose alerts, alternating schedule alerts, and library tracker reminders.

### Todoist integration

Proactive tasks after logging, alert tasks when reminders fire, two-way sync (completing Todoist tasks creates tracker entries), team workspace support.

### Widget

Baby info bar, daily summary dashboard, quick-action buttons, past-time clock, collapsible reorderable sections, health alerts, inline editing.

## Quick start

1. Install via [BRAT](https://github.com/TfTHacker/obsidian42-brat) -- add `cybersader/postpartum-tracker`
2. Run the command **Insert postpartum tracker** in any note
3. Start tracking

## Documentation

Full documentation at **[cybersader.github.io/postpartum-tracker](https://cybersader.github.io/postpartum-tracker/)**

- [Installation](https://cybersader.github.io/postpartum-tracker/getting-started/installation/) -- BRAT and manual install
- [Quick start](https://cybersader.github.io/postpartum-tracker/getting-started/quick-start/) -- First entries walkthrough
- [Tracker library](https://cybersader.github.io/postpartum-tracker/guides/tracker-library/) -- All available modules
- [Notifications](https://cybersader.github.io/postpartum-tracker/guides/notifications/) -- Reminders and webhooks
- [Todoist integration](https://cybersader.github.io/postpartum-tracker/guides/todoist-integration/) -- Task sync setup
- [Architecture](https://cybersader.github.io/postpartum-tracker/advanced/architecture/) -- Technical deep dive
- [Contributing](https://cybersader.github.io/postpartum-tracker/advanced/contributing/) -- Development setup

## Installation

### BRAT (recommended)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Community Plugins
2. BRAT Settings > Add Beta Plugin > `cybersader/postpartum-tracker`
3. Enable "Postpartum tracker" in Community Plugins

### Manual

1. Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/cybersader/postpartum-tracker/releases)
2. Create `<vault>/.obsidian/plugins/obsidian-postpartum-tracker/`
3. Copy the files into that folder and enable the plugin

## Development

```bash
bun install        # Install dependencies
bun run dev        # Watch mode
bun run build      # Production build
```

See the [Contributing](https://cybersader.github.io/postpartum-tracker/advanced/contributing/) guide for full dev setup, architecture overview, and release process.

## Inspired by

- [Baby Buddy](https://github.com/babybuddy/babybuddy) -- Open-source baby tracking
- [Obsidian Contractions Timer](https://github.com/cybersader/obsidian-contractions-timer) -- Same architecture pattern

## License

MIT
