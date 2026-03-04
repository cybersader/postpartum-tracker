# Architecture

## Overview

The plugin renders an interactive widget inside a `postpartum-tracker` markdown code block. All data is stored as JSON in the code block itself -- no external database.

## Key Components

### Plugin (main.ts)
- Registers the code block processor
- Creates `TrackerRegistry` and registers all modules (core + library)
- Manages `NotificationService` and `TodoistService`
- Simple event bus for tracker events (feeding-logged, medication-logged, etc.)

### TrackerWidget (widget/TrackerWidget.ts)
- Extends `MarkdownRenderChild` for proper lifecycle
- Builds UI: baby info bar, daily summary, quick actions, alerts, collapsible sections
- Iterates registry to initialize modules with their data
- Calls `module.tick()` every 200ms for live timers
- Handles section reordering (drag + arrows)

### TrackerModule Interface (trackers/BaseTracker.ts)
Every tracker implements:
- `parseEntries(raw)` / `serializeEntries()` -- Data marshaling
- `buildUI(bodyEl, save, settings, emitEvent)` -- Render section content
- `update(entries)` -- Receive new data after save
- `computeStats()` / `renderSummary()` -- Daily dashboard
- `getQuickActions()` -- Quick action buttons
- `tick()` -- Live timer updates (optional)
- `getAlerts()` -- Health alerts (optional)

### CodeBlockStore (data/CodeBlockStore.ts)
- `parse(source)` -- JSON string to `PostpartumData`, with defaults and backward compat
- `save(ctx, containerEl, data)` -- Atomic write via `ctx.getSectionInfo()` + `app.vault.process()`
- Preserves arbitrary tracker keys for library modules

### TrackerRegistry (data/TrackerRegistry.ts)
- Map<string, TrackerModule> with `register()`, `get()`, `getAll()` (sorted by defaultOrder)

## Code Block Scope & Data Locality

Each `postpartum-tracker` code block is **self-contained**. The JSON inside the code block holds all tracker data for that widget instance. Key implications:

- **Multiple code blocks** in different notes (or even the same note) have **independent data**. They don't share entries.
- **Plugin settings** (enabled modules, medication configs, notification preferences, Todoist config) are **global** -- stored in `data.json` and shared across all code blocks.
- **The library toggles** (enable/disable sleep, mood, etc.) control which `SimpleTrackerModule` instances get registered in the `TrackerRegistry` at plugin load. This is a global setting -- all code blocks see the same set of enabled modules.
- **Module layout order** is stored per-code-block in `layout: string[]`. Each code block can have its sections reordered independently.
- **Notification scanning** reads tracker data from **all** code blocks in the vault. `NotificationService.check()` scans all markdown files for `postpartum-tracker` code blocks and aggregates their data for alert evaluation. So if you have feeding entries spread across two code blocks, both are considered for the "time since last feeding" alert.
- **Todoist integration** fires tasks based on events from whichever code block the user interacts with. Two-way sync writes entries back to the **first** matching code block found in the vault.

**Practical recommendation**: Use a single code block in one note (e.g., "Baby Tracker.md"). Multiple code blocks are supported but can cause confusion with notification aggregation and Todoist two-way sync targeting.

## Data Flow

```
User taps button
  -> module.logEntry()
  -> entries.push(entry)
  -> emitEvent('feeding-logged', entry)
  -> save()
    -> for each module: data.trackers[id] = module.serializeEntries()
    -> CodeBlockStore.save(ctx, containerEl, data)
      -> app.vault.process(file, content => ...)
        -> Obsidian detects change, re-renders code block
          -> new TrackerWidget created with updated JSON
```

## Data Schema (PostpartumData)

```typescript
{
  version: 1,
  meta: { babyName?, birthDate?, birthWeight?, unitSystem? },
  layout: ['feeding', 'diaper', 'medication', ...],
  trackers: {
    feeding: FeedingEntry[],
    diaper: DiaperEntry[],
    medication: MedicationEntry[],
    medicationConfig: MedicationConfig[],
    logNotes: LogNoteEntry[],
    // Library trackers stored by ID:
    sleep: SimpleTrackerEntry[],
    pumping: SimpleTrackerEntry[],
    // ...
  },
  settingsOverrides?: Partial<PostpartumTrackerSettings>
}
```

## Event System

Simple Map-based event bus on the plugin instance:
- `emitTrackerEvent(event)` -- Fire to all listeners for `event.type`
- `onTrackerEvent(type, listener)` -- Register listener

Event types: `feeding-logged`, `medication-logged`, `diaper-logged`, `simple-logged`, `todoist-entry-created`

## Module Categories

1. **Core modules** (feeding, diaper, medication) -- Dedicated TrackerModule classes with custom UI, deep notification integration, Todoist task lifecycle
2. **Library modules** (sleep, pain, mood, etc.) -- Instantiated from `SimpleTrackerDef` definitions via `SimpleTrackerModule`, no custom code per tracker
