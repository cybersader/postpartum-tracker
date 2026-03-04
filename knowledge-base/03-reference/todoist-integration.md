# Todoist Integration

## API

Uses **Todoist API v1** (`https://api.todoist.com/api/v1`).

Key differences from the deprecated v2:
- List endpoints return `{ results: [...], next_cursor }` instead of bare arrays
- Task field: `checked` instead of `is_completed`
- IDs are strings

Uses `requestUrl` from Obsidian (CORS-friendly, no external fetch needed).

## Setup Flow

1. User enters API token in settings
2. "Test connection" verifies the token
3. "Setup project" creates (or finds) a Todoist project + sections (feeding, diaper, medication)
4. Section IDs stored in settings for future task creation

## Task Lifecycle

### Proactive Tasks (createOnLog)

Triggered by tracker events:

- **feeding-logged** -- Creates "Check if baby is hungry (try [opposite side])" with estimated time
- **medication-logged** -- Creates "Take [med] [dosage]" with safe-after time
- **simple-logged** -- Creates reminder task using `notificationConfig.reminderMessage` (if defined)

Each proactive task has an `eventKey` in the task map. When a new event fires:
1. Complete the existing task for that key (if any)
2. Create a new task with the updated timing

### Alert Tasks (createOnAlert)

When `NotificationService` fires a notification, `onNotificationFired()` creates a Todoist task. When the alert condition clears, `onNotificationCleared()` completes the task.

### Due Dates

Controlled by `dueDateStyle`:
- `none` -- No due date, timing info in description only
- `date` -- Date-only due date (shows in Todoist Today view)
- `datetime` -- Exact due time (triggers Todoist reminder if Pro subscription)

## Two-Way Sync

When `twoWaySync` is enabled:
1. On each notification check cycle, `syncFromTodoist()` is called
2. Iterates non-alert tracked tasks that weren't completed by us
3. Checks if the Todoist task is completed (`task.checked`)
4. If completed externally, `handleExternalCompletion()` creates a corresponding entry in the vault

## Task Map

Persisted in `localStorage` under `pt-todoist-tasks`:

```typescript
interface TrackedTask {
  taskId: string;
  eventKey: string;    // e.g., 'feeding-next', 'med-tylenol-next', 'alert-feeding-overdue'
  category: string;    // module ID
  createdAt: number;
  completedByUs: boolean;
  metadata?: Record<string, string>;
}
```

Stale entries (>48h old, completed) are cleaned periodically.

## Section IDs

The `sectionIds` map in settings supports arbitrary keys via index signature:
```typescript
sectionIds: { feeding: string; diaper: string; medication: string; [key: string]: string }
```

Library tracker tasks use the section for their module ID, falling back to no section if not configured.
