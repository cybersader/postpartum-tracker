/**
 * TodoistService — Todoist integration for the postpartum tracker.
 *
 * Uses Todoist API v1 (https://api.todoist.com/api/v1).
 * Note: v2 (/rest/v2) was deprecated and returns 410 Gone.
 *
 * API v1 differences from v2:
 * - Base URL: /api/v1 instead of /rest/v2
 * - List endpoints return { results: [...], next_cursor } instead of bare arrays
 * - Task field: `checked` instead of `is_completed`
 * - IDs are strings
 *
 * All API calls are fire-and-forget — never blocks the save flow.
 */

import { Notice, requestUrl } from 'obsidian';
import type PostpartumTrackerPlugin from '../main';
import type {
	TodoistSettings,
	TrackerEvent,
	NotificationItem,
	FeedingEntry,
	MedicationEntry,
	MedicationConfig,
	SimpleTrackerEntry,
} from '../types';
import { DEFAULT_MEDICATIONS } from '../types';
import { TRACKER_LIBRARY } from '../trackers/library';

// ── Todoist API Types ───────────────────────────────────────

interface TodoistWorkspace {
	id: string;
	name: string;
}

interface TodoistProject {
	id: string;
	name: string;
	workspace_id?: string | null;
}

interface TodoistSection {
	id: string;
	name: string;
	project_id: string;
}

interface TodoistTask {
	id: string;
	content: string;
	description: string;
	checked: boolean;
	section_id: string | null;
	priority: number;
	labels: string[];
	due?: { datetime?: string; date?: string; string?: string } | null;
}

/** Paginated list response wrapper used by API v1. */
interface PaginatedResponse<T> {
	results: T[];
	next_cursor: string | null;
}

// ── Task Map ────────────────────────────────────────────────

interface TrackedTask {
	taskId: string;
	eventKey: string;
	category: string;
	createdAt: number;
	completedByUs: boolean;
	metadata?: Record<string, string>;
}

const TASK_MAP_KEY = 'pt-todoist-tasks';
const API_BASE = 'https://api.todoist.com/api/v1';
const LOG_FILE = 'todoist-debug.log';

export class TodoistService {
	private plugin: PostpartumTrackerPlugin;
	private taskMap: Map<string, TrackedTask> = new Map();

	constructor(plugin: PostpartumTrackerPlugin) {
		this.plugin = plugin;
		this.loadTaskMap();
	}

	// ── Logging ─────────────────────────────────────────────

	/** Append a timestamped line to todoist-debug.log in the vault root. */
	private async log(msg: string, data?: unknown): Promise<void> {
		const ts = new Date().toISOString();
		let line = `[${ts}] ${msg}`;
		if (data !== undefined) {
			try { line += '\n  ' + JSON.stringify(data); } catch { /* skip */ }
		}
		line += '\n';

		try {
			const vault = this.plugin.app.vault;
			const file = vault.getAbstractFileByPath(LOG_FILE);
			if (file && 'path' in file) {
				const existing = await vault.read(file as any);
				await vault.modify(file as any, existing + line);
			} else {
				await vault.create(LOG_FILE, `# Todoist Debug Log\n\n${line}`);
			}
		} catch { /* silent — logging should never break anything */ }
	}

	// ── Settings accessor ───────────────────────────────────

	private get settings(): TodoistSettings {
		return this.plugin.settings.todoist;
	}

	private get enabled(): boolean {
		return this.settings.enabled && !!this.settings.apiToken && this.settings.setupComplete;
	}

	// ── API Helpers ─────────────────────────────────────────

	/**
	 * Make a request to Todoist API v1.
	 * For list endpoints, automatically unwraps { results } if T is an array type.
	 */
	private async api<T>(
		method: 'GET' | 'POST' | 'DELETE',
		path: string,
		body?: Record<string, unknown>
	): Promise<T | null> {
		const url = `${API_BASE}${path}`;
		try {
			const headers: Record<string, string> = {
				'Authorization': `Bearer ${this.settings.apiToken}`,
			};
			if (body) {
				headers['Content-Type'] = 'application/json';
			}

			await this.log(`API ${method} ${path}`, body || undefined);

			const res = await requestUrl({
				url,
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined,
				throw: false,
			});

			await this.log(`API response ${res.status}`, {
				status: res.status,
				bodyPreview: typeof res.text === 'string' ? res.text.substring(0, 500) : '(no text)',
			});

			if (res.status === 404) return null;
			if (res.status === 204 || res.status === 200 && !res.text?.trim()) return null;
			if (res.status < 200 || res.status >= 300) {
				await this.log(`API error: ${res.status}`, res.text);
				return null;
			}

			return res.json as T;
		} catch (e) {
			await this.log(`API exception ${method} ${path}`, String(e));
			return null;
		}
	}

	/**
	 * Fetch a paginated list from API v1 — unwraps { results } automatically.
	 */
	private async apiList<T>(path: string): Promise<T[] | null> {
		const res = await this.api<PaginatedResponse<T>>('GET', path);
		if (!res) return null;
		// Handle both old format (bare array) and new format ({ results })
		if (Array.isArray(res)) return res as unknown as T[];
		if (res.results && Array.isArray(res.results)) return res.results;
		await this.log('apiList: unexpected response shape', res);
		return null;
	}

	// ── Connection & Setup ──────────────────────────────────

	/** Test if the API token is valid. Returns true on success. */
	async testConnection(): Promise<boolean> {
		await this.log('testConnection: starting', {
			tokenLength: this.settings.apiToken?.length || 0,
			tokenPrefix: this.settings.apiToken?.substring(0, 4) + '...',
		});
		try {
			const url = `${API_BASE}/projects`;
			await this.log('testConnection: requesting', { url });

			const res = await requestUrl({
				url,
				method: 'GET',
				headers: { 'Authorization': `Bearer ${this.settings.apiToken}` },
				throw: false,
			});

			await this.log('testConnection: response', {
				status: res.status,
				headers: res.headers,
				bodyPreview: typeof res.text === 'string' ? res.text.substring(0, 300) : '(no text)',
			});

			const ok = res.status >= 200 && res.status < 300;
			if (!ok) {
				await this.log(`testConnection: FAILED status=${res.status}`);
			} else {
				await this.log('testConnection: SUCCESS');
			}
			return ok;
		} catch (e) {
			await this.log('testConnection: EXCEPTION', String(e));
			return false;
		}
	}

	/**
	 * Fetch available workspaces (teams) for the connected account.
	 * Returns empty array if user has no teams.
	 */
	async fetchWorkspaces(): Promise<TodoistWorkspace[]> {
		if (!this.settings.apiToken) return [];
		const workspaces = await this.apiList<TodoistWorkspace>('/workspaces');
		return workspaces || [];
	}

	/**
	 * Find or create the Baby care project and its sections.
	 * If workspaceId is set, creates the project under that team workspace.
	 */
	async setup(): Promise<boolean> {
		if (!this.settings.apiToken) return false;

		try {
			await this.log('setup: fetching projects');
			const projects = await this.apiList<TodoistProject>('/projects');
			if (!projects) {
				await this.log('setup: failed to fetch projects');
				return false;
			}
			await this.log(`setup: found ${projects.length} projects`);

			let project: TodoistProject | undefined = projects.find(p => p.name === this.settings.projectName);
			if (!project) {
				const createBody: Record<string, unknown> = { name: this.settings.projectName };
				if (this.settings.workspaceId) {
					createBody.workspace_id = this.settings.workspaceId;
				}
				await this.log('setup: creating project', createBody);
				const created = await this.api<TodoistProject>('POST', '/projects', createBody);
				if (!created) {
					await this.log('setup: failed to create project');
					return false;
				}
				project = created;
			}
			await this.log('setup: using project', { id: project.id, name: project.name });
			this.settings.projectId = project.id;

			// Find or create sections
			const sections = await this.apiList<TodoistSection>(`/sections?project_id=${project.id}`);
			if (!sections) {
				await this.log('setup: failed to fetch sections');
				return false;
			}
			await this.log(`setup: found ${sections.length} sections`);

			const sectionNames = {
				feeding: 'Feeding',
				diaper: 'Diapers',
				medication: 'Medication',
			};

			for (const [key, name] of Object.entries(sectionNames)) {
				let section: TodoistSection | undefined = sections.find(s => s.name === name);
				if (!section) {
					await this.log(`setup: creating section "${name}"`);
					const created = await this.api<TodoistSection>('POST', '/sections', {
						name,
						project_id: project.id,
					});
					if (created) section = created;
				}
				if (section) {
					this.settings.sectionIds[key as keyof typeof sectionNames] = section.id;
					await this.log(`setup: section "${name}" = ${section.id}`);
				}
			}

			this.settings.setupComplete = true;
			this.settings.lastConnectedAt = Date.now();
			await this.plugin.saveSettings();

			await this.log('setup: COMPLETE');
			return true;
		} catch (e) {
			await this.log('setup: EXCEPTION', String(e));
			return false;
		}
	}

	// ── Task CRUD ───────────────────────────────────────────

	private async createTask(opts: {
		content: string;
		description?: string;
		/** ISO datetime for when the task is relevant. Applied based on dueDateStyle setting. */
		suggestedTime?: string;
		priority?: number;
		sectionId?: string;
		labels?: string[];
	}): Promise<string | null> {
		const prefix = this.settings.taskPrefix ? `${this.settings.taskPrefix} ` : '';
		const body: Record<string, unknown> = {
			content: prefix + opts.content,
			project_id: this.settings.projectId,
		};
		if (opts.description) body.description = opts.description;

		// Apply due date based on user preference
		if (opts.suggestedTime && this.settings.dueDateStyle !== 'none') {
			if (this.settings.dueDateStyle === 'datetime') {
				body.due_datetime = opts.suggestedTime;
			} else if (this.settings.dueDateStyle === 'date') {
				body.due_date = opts.suggestedTime.split('T')[0];
			}
		}

		if (opts.priority) body.priority = opts.priority;
		if (opts.sectionId) body.section_id = opts.sectionId;
		if (opts.labels?.length) body.labels = opts.labels;

		const task = await this.api<TodoistTask>('POST', '/tasks', body);
		return task?.id || null;
	}

	private async completeTask(taskId: string): Promise<void> {
		await this.api<null>('POST', `/tasks/${taskId}/close`);
	}

	private async getTask(taskId: string): Promise<TodoistTask | null> {
		return this.api<TodoistTask>('GET', `/tasks/${taskId}`);
	}

	// ── Notification Hooks ──────────────────────────────────

	async onNotificationFired(notif: NotificationItem): Promise<void> {
		if (!this.enabled || !this.settings.createOnAlert) return;

		const eventKey = `alert-${notif.id}`;
		if (this.taskMap.has(eventKey)) return;

		const sectionId = this.settings.sectionIds[notif.category] || undefined;
		const taskId = await this.createTask({
			content: notif.title,
			description: notif.message,
			priority: this.settings.alertPriority,
			sectionId,
			labels: this.settings.labels,
		});

		if (taskId) {
			this.taskMap.set(eventKey, {
				taskId, eventKey, category: notif.category,
				createdAt: Date.now(), completedByUs: false,
			});
			this.saveTaskMap();
		}
	}

	async onNotificationCleared(notifId: string): Promise<void> {
		if (!this.enabled) return;

		const eventKey = `alert-${notifId}`;
		const tracked = this.taskMap.get(eventKey);
		if (!tracked) return;

		tracked.completedByUs = true;
		this.saveTaskMap();
		await this.completeTask(tracked.taskId);
		this.taskMap.delete(eventKey);
		this.saveTaskMap();
	}

	// ── Tracker Event Hooks ─────────────────────────────────

	async onTrackerEvent(event: TrackerEvent): Promise<void> {
		if (!this.enabled || !this.settings.createOnLog) return;

		switch (event.type) {
			case 'feeding-logged':
				await this.handleFeedingLogged(event.entry as FeedingEntry);
				break;
			case 'medication-logged':
				await this.handleMedicationLogged(
					event.entry as MedicationEntry,
					event.config as MedicationConfig | undefined
				);
				break;
			case 'diaper-logged':
				break;
			case 'simple-logged':
				if (event.module) {
					await this.handleSimpleLogged(event.entry as SimpleTrackerEntry, event.module);
				}
				break;
		}
	}

	private async handleFeedingLogged(entry: FeedingEntry): Promise<void> {
		const eventKey = 'feeding-next';
		const existing = this.taskMap.get(eventKey);
		if (existing) {
			existing.completedByUs = true;
			this.saveTaskMap();
			await this.completeTask(existing.taskId);
			this.taskMap.delete(eventKey);
		}

		const endTime = entry.end ? new Date(entry.end) : new Date();
		const estimateTime = new Date(endTime.getTime() + this.settings.feedingIntervalHours * 3_600_000);
		const estimateStr = estimateTime.toISOString().replace(/\.\d{3}Z$/, 'Z');

		const sideHint = entry.side === 'left' ? 'right' : entry.side === 'right' ? 'left' : '';
		const content = sideHint ? `Check if baby is hungry (try ${sideHint} side)` : 'Check if baby is hungry';

		const h = this.settings.feedingIntervalHours;
		const desc = [
			`Last feeding ended at ${endTime.toLocaleTimeString()}`,
			`Typical interval: ~${h}h (estimate around ${estimateTime.toLocaleTimeString()})`,
			`Note: Babies cluster feed — this is just a gentle reminder, not a hard schedule.`,
		].join('\n');

		const taskId = await this.createTask({
			content,
			description: desc,
			suggestedTime: estimateStr,
			priority: this.settings.proactivePriority,
			sectionId: this.settings.sectionIds.feeding,
			labels: this.settings.labels,
		});

		if (taskId) {
			this.taskMap.set(eventKey, {
				taskId, eventKey, category: 'feeding',
				createdAt: Date.now(), completedByUs: false,
			});
			this.saveTaskMap();
		}
	}

	private async handleMedicationLogged(
		entry: MedicationEntry,
		config?: MedicationConfig
	): Promise<void> {
		const medKey = entry.name.toLowerCase().replace(/\s+/g, '-');
		const eventKey = `med-${medKey}-next`;

		const existing = this.taskMap.get(eventKey);
		if (existing) {
			existing.completedByUs = true;
			this.saveTaskMap();
			await this.completeTask(existing.taskId);
			this.taskMap.delete(eventKey);
		}

		if (!config) return;
		const doseTime = new Date(entry.timestamp);
		const safeTime = new Date(doseTime.getTime() + config.minIntervalHours * 3_600_000);
		const safeStr = safeTime.toISOString().replace(/\.\d{3}Z$/, 'Z');

		const desc = [
			`Last dose: ${doseTime.toLocaleTimeString()}`,
			`Safe to take after: ${safeTime.toLocaleTimeString()} (${config.minIntervalHours}h interval)`,
		].join('\n');

		const taskId = await this.createTask({
			content: `Take ${config.name}${config.dosage ? ` ${config.dosage}` : ''}`,
			description: desc,
			suggestedTime: safeStr,
			priority: this.settings.proactivePriority,
			sectionId: this.settings.sectionIds.medication,
			labels: this.settings.labels,
		});

		if (taskId) {
			this.taskMap.set(eventKey, {
				taskId, eventKey, category: 'medication',
				createdAt: Date.now(), completedByUs: false,
				metadata: { medName: config.name, dosage: config.dosage },
			});
			this.saveTaskMap();
		}
	}

	private async handleSimpleLogged(
		entry: SimpleTrackerEntry,
		moduleId: string
	): Promise<void> {
		const def = TRACKER_LIBRARY.find(d => d.id === moduleId);
		if (!def?.notificationConfig) return;

		const eventKey = `simple-${moduleId}-next`;
		const existing = this.taskMap.get(eventKey);
		if (existing) {
			existing.completedByUs = true;
			this.saveTaskMap();
			await this.completeTask(existing.taskId);
			this.taskMap.delete(eventKey);
		}

		const cfg = def.notificationConfig;
		const logTime = new Date(entry.timestamp);
		const nextTime = new Date(logTime.getTime() + cfg.reminderIntervalHours * 3_600_000);
		const nextStr = nextTime.toISOString().replace(/\.\d{3}Z$/, 'Z');

		const desc = [
			`Last ${def.displayName.toLowerCase()}: ${logTime.toLocaleTimeString()}`,
			`Reminder in ~${cfg.reminderIntervalHours}h`,
		].join('\n');

		const sectionId = this.settings.sectionIds[moduleId] || undefined;
		const taskId = await this.createTask({
			content: cfg.reminderMessage,
			description: desc,
			suggestedTime: nextStr,
			priority: this.settings.proactivePriority,
			sectionId,
			labels: this.settings.labels,
		});

		if (taskId) {
			this.taskMap.set(eventKey, {
				taskId, eventKey, category: moduleId,
				createdAt: Date.now(), completedByUs: false,
			});
			this.saveTaskMap();
		}
	}

	// ── Two-Way Sync ────────────────────────────────────────

	async syncFromTodoist(): Promise<void> {
		if (!this.enabled || !this.settings.twoWaySync) return;

		const toProcess: TrackedTask[] = [];
		for (const [, tracked] of this.taskMap) {
			if (tracked.eventKey.startsWith('alert-')) continue;
			if (tracked.completedByUs) continue;
			toProcess.push(tracked);
		}

		for (const tracked of toProcess) {
			try {
				const task = await this.getTask(tracked.taskId);
				if (task === null || task.checked) {
					await this.handleExternalCompletion(tracked);
					this.taskMap.delete(tracked.eventKey);
					this.saveTaskMap();
				}
			} catch { /* skip */ }
		}
	}

	private async handleExternalCompletion(tracked: TrackedTask): Promise<void> {
		const now = new Date().toISOString();

		switch (tracked.category) {
			case 'feeding': {
				const entry: FeedingEntry = {
					id: `f-${Date.now()}`,
					type: 'breast',
					side: 'both',
					start: now,
					end: new Date(Date.now() + 15 * 60_000).toISOString(),
					durationSec: 15 * 60,
					notes: 'Logged from Todoist',
				};
				this.plugin.emitTrackerEvent({
					type: 'todoist-entry-created', entry, module: 'feeding',
				});
				await this.handleFeedingLogged(entry);
				break;
			}
			case 'medication': {
				const medName = tracked.metadata?.medName || 'Unknown';
				const dosage = tracked.metadata?.dosage || '';
				const entry: MedicationEntry = {
					id: `m-${Date.now()}`,
					name: medName, dosage,
					timestamp: now,
					notes: 'Logged from Todoist',
				};
				const configs = this.plugin.settings.medication.medications || DEFAULT_MEDICATIONS;
				const config = configs.find(c => c.name.toLowerCase() === medName.toLowerCase());
				this.plugin.emitTrackerEvent({
					type: 'todoist-entry-created', entry, module: 'medication',
				});
				if (config) await this.handleMedicationLogged(entry, config);
				break;
			}
			default: break;
		}
	}

	// ── Toast Suppression ───────────────────────────────────

	shouldSuppressToasts(): boolean {
		return this.enabled && this.settings.suppressToasts;
	}

	// ── Task Map Persistence ────────────────────────────────

	private loadTaskMap(): void {
		try {
			const raw = localStorage.getItem(TASK_MAP_KEY);
			if (raw) {
				const entries: TrackedTask[] = JSON.parse(raw);
				this.taskMap.clear();
				for (const t of entries) this.taskMap.set(t.eventKey, t);
			}
		} catch { this.taskMap.clear(); }
	}

	private saveTaskMap(): void {
		try {
			localStorage.setItem(TASK_MAP_KEY, JSON.stringify(Array.from(this.taskMap.values())));
		} catch { /* silent */ }
	}

	cleanStaleEntries(): void {
		const cutoff = Date.now() - 48 * 3_600_000;
		let changed = false;
		for (const [key, tracked] of this.taskMap) {
			if (tracked.createdAt < cutoff) {
				this.taskMap.delete(key);
				changed = true;
			}
		}
		if (changed) this.saveTaskMap();
	}
}
