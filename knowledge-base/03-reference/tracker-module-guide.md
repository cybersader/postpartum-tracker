# Tracker Module Guide

How to create a new **custom** TrackerModule class (for modules that need more than the simple data-driven approach).

## When to Use a Custom Module

Use `SimpleTrackerModule` (see [simple-tracker-guide.md](simple-tracker-guide.md)) for most new trackers. Only create a custom module when you need:
- Custom UI beyond dynamic form fields
- Complex state management (e.g., feeding's active timer with side tracking)
- Custom stats computation or visualization
- Special alert logic that doesn't fit the interval-based pattern
- Interaction with other modules' data

## Steps

### 1. Create the module file

```
src/trackers/my-module/MyModule.ts
src/trackers/my-module/myModuleStats.ts  (optional)
```

### 2. Implement TrackerModule

```typescript
import type { TrackerModule } from '../BaseTracker';

interface MyEntry { id: string; timestamp: string; /* ... */ }
interface MyStats { /* ... */ }

export class MyModule implements TrackerModule<MyEntry, MyStats> {
  readonly id = 'my-module';
  readonly displayName = 'My module';
  readonly defaultExpanded = false;
  readonly defaultOrder = 50;

  private entries: MyEntry[] = [];
  private save: (() => Promise<void>) | null = null;

  parseEntries(raw: unknown): MyEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw as MyEntry[];
  }

  serializeEntries(): MyEntry[] { return this.entries; }
  emptyEntries(): MyEntry[] { return []; }
  update(entries: MyEntry[]): void { this.entries = entries; }

  buildUI(bodyEl, save, settings, emitEvent): void {
    this.save = save;
    // Build your UI here
  }

  getQuickActions(): QuickAction[] { return []; }
  computeStats(entries, dayStart, dayEnd): MyStats { /* ... */ }
  renderSummary(el, stats): void { /* ... */ }
}
```

### 3. Register in main.ts

```typescript
import { MyModule } from './trackers/my-module/MyModule';
// In onload():
this.registry.register(new MyModule());
```

### 4. Add to enabledModules default

In `types.ts`, add `'my-module'` to `DEFAULT_SETTINGS.enabledModules`.

### 5. Add entry type to types.ts (if needed)

Add the entry interface and include it in the `TrackerEvent` union if you need event integration.

## Important Patterns

### Event Handling in Code Blocks
Use `pointerdown`/`pointerup` with `preventDefault` + `stopImmediatePropagation` for all buttons. CodeMirror 6 in Live Preview eats regular `click` events.

### Save Cycle
`save()` triggers a full re-render. After save, Obsidian rewrites the code block and creates a new TrackerWidget. Don't hold references to DOM elements across saves.

### Entry Sorting
Always sort entries by timestamp after adding/editing, so they display chronologically.

### Inline Edit Panel
Use `InlineEditPanel` for editing entries -- it handles datetime-local pickers, CodeMirror event prevention, and mobile-friendly layout.
