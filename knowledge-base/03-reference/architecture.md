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
