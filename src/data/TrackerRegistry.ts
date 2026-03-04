import type { TrackerModule } from '../trackers/BaseTracker';

/**
 * Central registry of all available tracker modules.
 * Modules register themselves at plugin load time.
 * The widget iterates the registry to build sections.
 */
export class TrackerRegistry {
	private modules: Map<string, TrackerModule> = new Map();

	register(module: TrackerModule): void {
		if (this.modules.has(module.id)) {
			console.warn(`Postpartum Tracker: duplicate module ID "${module.id}"`);
			return;
		}
		this.modules.set(module.id, module);
	}

	get(id: string): TrackerModule | undefined {
		return this.modules.get(id);
	}

	getAll(): TrackerModule[] {
		return [...this.modules.values()].sort((a, b) => a.defaultOrder - b.defaultOrder);
	}

	getIds(): string[] {
		return this.getAll().map(m => m.id);
	}
}
