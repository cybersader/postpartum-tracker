# Notification System

## Overview

`NotificationService` runs at the plugin level (not inside the ephemeral widget). It periodically scans the vault for tracker data and evaluates alert conditions.

## Check Loop

1. `start()` -- Sets up `setInterval` based on `settings.checkIntervalMin`
2. `check()` -- Main loop:
   - Clean expired snoozes
   - Scan vault for `postpartum-tracker` code block data
   - Evaluate alert conditions (see below)
   - Fire new notifications via configured channels
   - Remove notifications whose conditions cleared
   - Trigger Todoist sync

## Alert Evaluators

### Feeding Reminder
- Checks time since last completed feeding
- Fires when `hoursSince >= feedingReminderHours`
- No alert if a feeding is actively in progress

### Medication Dose Ready
- For each enabled medication config, checks time since last dose
- Fires within a 5-minute window after `minIntervalHours` elapses

### Alternating Medication Schedule
- Checks Tylenol + Ibuprofen alternating pattern
- Fires 3h after the most recent pain med (suggesting the other)

### Simple Tracker Reminders
- Iterates `TRACKER_LIBRARY` definitions with `notificationConfig.reminderEnabled`
- Checks time since last entry against `reminderIntervalHours`
- Only fires for modules in `settings.enabledModules`

## Channels

### In-App Toast (ToastNotification)
- Fixed-position container in bottom-right
- Shows title, message, dismiss button, snooze menu (15m, 30m, 1h, 2h)
- Suppressed when Todoist is handling reminders (`suppressToasts`)

### System Notification
- Web Notification API (`new Notification(...)`)
- Desktop only (Capacitor blocks it on mobile)
- Requests permission on first use

### Webhook
- POST to configured URL
- JSON body: `{ title, message, priority, extras: { category, plugin } }`
- Works with Gotify, ntfy.sh, or any REST endpoint

## Snooze Persistence

- Stored in `localStorage` under `pt-notification-snooze`
- Map of `{ notificationId: expiresTimestamp }`
- Cleaned on each check cycle

## Fired-This-Session Tracking

- `firedThisSession: Set<string>` prevents re-firing after dismiss
- Cleared when the alert condition no longer applies (e.g., user logs a feeding)
