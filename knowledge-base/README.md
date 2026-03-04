# Knowledge Base

Developer documentation for the Postpartum Tracker plugin. Organized using a temperature gradient system:

| Folder | Purpose |
|--------|---------|
| `00-inbox/` | Raw notes, ideas, and incoming information |
| `01-working/` | Active investigations and in-progress docs |
| `02-learnings/` | Validated patterns and discoveries |
| `03-reference/` | Stable reference documentation |
| `04-archive/` | Outdated or superseded docs |

## Reference Docs

- [Architecture](03-reference/architecture.md) -- TrackerModule interface, data flow, save cycle
- [Tracker Module Guide](03-reference/tracker-module-guide.md) -- How to create new TrackerModule implementations
- [Simple Tracker Guide](03-reference/simple-tracker-guide.md) -- How to add SimpleTrackerDef definitions
- [Notification System](03-reference/notification-system.md) -- NotificationService, alert evaluators, channels
- [Todoist Integration](03-reference/todoist-integration.md) -- TodoistService API v1, task lifecycle, two-way sync
