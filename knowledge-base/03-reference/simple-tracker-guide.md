# Simple Tracker Guide

How to add a new tracker to the library without writing any custom code.

## Steps

### 1. Add a definition to `src/trackers/library.ts`

```typescript
{
  id: 'my-tracker',              // Unique ID, used as key in data
  displayName: 'My tracker',     // Shown in UI
  category: 'general',           // baby-care | baby-development | mother-recovery | general
  icon: '\uD83D\uDCCB',         // Emoji icon
  description: 'Track something useful',
  isSmart: false,                // true if it has notification logic
  fields: [
    { key: 'value', label: 'Value', type: 'number', unit: 'kg', required: true },
    { key: 'method', label: 'Method', type: 'select', options: ['a', 'b', 'c'] },
  ],
  defaultOrder: 50,              // Sort order (lower = higher in list)
  hasDuration: false,            // true for start/stop timer
  // Optional notification config:
  notificationConfig: {
    reminderEnabled: true,
    reminderIntervalHours: 8,
    reminderMessage: 'Time to track again',
  },
},
```

### 2. That's it

The `SimpleTrackerModule` class handles everything:
- Dynamic form generation from field definitions
- Quick action button with icon + name
- Start/stop timer (if `hasDuration: true`)
- Entry list with inline editing
- Stats (today count, time since last)
- Notifications (if `notificationConfig` provided)
- Todoist proactive tasks (if `notificationConfig` provided)
- Data persistence (stored under `trackers[id]` in the code block JSON)

### Field Types

| Type | Input | Stored As |
|------|-------|-----------|
| `text` | Text input | `string` |
| `number` | Number input with optional unit | `number` |
| `select` | Dropdown from `options[]` | `string` |
| `boolean` | Yes/No dropdown | `boolean` |
| `rating` | Numeric selector (min-max) | `number` |
| `datetime` | Datetime picker | `string` (ISO8601) |

### Enabling

Users enable trackers in Settings > Tracker Library. The module ID is added to `settings.enabledModules[]`. Plugin reload is required.

### Data Format

Entries stored as `SimpleTrackerEntry`:

```typescript
{
  id: string,
  timestamp: string,         // ISO8601
  end?: string | null,       // For duration trackers
  durationSec?: number,
  fields: { value: 98.6, method: 'rectal' },
  notes: string,
}
```
