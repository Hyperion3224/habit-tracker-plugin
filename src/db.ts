import { App, normalizePath, TFile, Notice } from "obsidian";
import { HabitsDb, Participant, Habit, Completion, IsoDate, ParticipantId, HabitId } from "./types";
import { completionKey, newId } from "./ids";

const DB_PATH = "Habits/_data/habits-db.json";

function emptyDb(): HabitsDb {
  return {
    schemaVersion: 1,
    updatedAt: Date.now(),
    participants: {},
    habits: {},
    completions: {},
  };
}

async function ensureFolders(app: App, fullPath: string): Promise<void> {
  // Create intermediate folders if missing (Obsidian vault API does not auto-create).
  const parts = normalizePath(fullPath).split("/");
  parts.pop(); // remove filename
  let cur = "";
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    const existing = app.vault.getAbstractFileByPath(cur);
    if (!existing) await app.vault.createFolder(cur);
  }
}

export class HabitsDbStore {
  private app: App;
  private file: TFile | null = null;
  private db: HabitsDb = emptyDb();
  private loaded = false;
  private saving = false;

  constructor(app: App) {
    this.app = app;
  }

  async load(): Promise<void> {
    const path = normalizePath(DB_PATH);
    await ensureFolders(this.app, path);

    let af = this.app.vault.getAbstractFileByPath(path);
    if (!af) {
      const f = await this.app.vault.create(path, JSON.stringify(emptyDb(), null, 2));
      this.file = f;
      this.db = emptyDb();
      this.loaded = true;
      return;
    }

    if (!(af instanceof TFile)) throw new Error(`DB path is not a file: ${path}`);

    this.file = af;
    const text = await this.app.vault.read(af);

    try {
      const parsed = JSON.parse(text) as HabitsDb;
      // Basic validation
      if (!parsed || parsed.schemaVersion !== 1) throw new Error("Unsupported schema");
      parsed.participants ??= {};
      parsed.habits ??= {};
      parsed.completions ??= {};
      this.db = parsed;
      this.loaded = true;
    } catch (e) {
      new Notice("Habit Tracker: DB file is invalid JSON. Creating a backup and resetting.");
      // Backup and reset
      await this.app.vault.create(
        path.replace(/\.json$/, `-backup-${Date.now()}.json`),
        text
      );
      this.db = emptyDb();
      await this.persist();
      this.loaded = true;
    }
  }

  /**
   * Call this when you suspect the file changed due to sync.
   * For MVP we will just reload before each write to reduce conflicts.
   */
  async reloadFromDisk(): Promise<void> {
    if (!this.file) return;
    const text = await this.app.vault.read(this.file);
    try {
      const parsed = JSON.parse(text) as HabitsDb;
      if (parsed?.schemaVersion === 1) {
        parsed.participants ??= {};
        parsed.habits ??= {};
        parsed.completions ??= {};
        this.db = parsed;
      }
    } catch {
      // ignore; keep in-memory db
    }
  }

  getSnapshot(): HabitsDb {
    if (!this.loaded) throw new Error("DB not loaded");
    // shallow copy is fine for read-only usage in views
    return this.db;
  }

  async upsertParticipant(name: string, id?: ParticipantId): Promise<Participant> {
    await this.reloadFromDisk();

    const pid = id ?? newId("p");
    const existing = this.db.participants[pid];

    const participant: Participant = {
      id: pid,
      name: name.trim(),
      createdAt: existing?.createdAt ?? Date.now(),
      archived: existing?.archived ?? false,
    };

    this.db.participants[pid] = participant;
    this.db.updatedAt = Date.now();
    await this.persist();
    return participant;
  }

  async archiveParticipant(participantId: ParticipantId, archived = true): Promise<void> {
    await this.reloadFromDisk();
    const p = this.db.participants[participantId];
    if (!p) return;
    p.archived = archived;
    this.db.updatedAt = Date.now();
    await this.persist();
  }

  async addHabit(participantId: ParticipantId, name: string): Promise<Habit> {
    await this.reloadFromDisk();

    const habit: Habit = {
      id: newId("h"),
      participantId,
      name: name.trim(),
      schedule: "daily",
      createdAt: Date.now(),
      archived: false,
    };

    this.db.habits[habit.id] = habit;
    this.db.updatedAt = Date.now();
    await this.persist();
    return habit;
  }

  async renameHabit(habitId: HabitId, name: string): Promise<void> {
    await this.reloadFromDisk();
    const h = this.db.habits[habitId];
    if (!h) return;
    h.name = name.trim();
    this.db.updatedAt = Date.now();
    await this.persist();
  }

  async archiveHabit(habitId: HabitId, archived = true): Promise<void> {
    await this.reloadFromDisk();
    const h = this.db.habits[habitId];
    if (!h) return;
    h.archived = archived;
    this.db.updatedAt = Date.now();
    await this.persist();
  }

  async setCompletion(participantId: ParticipantId, habitId: HabitId, date: IsoDate, completed: boolean): Promise<void> {
    await this.reloadFromDisk();

    const key = completionKey(participantId, habitId, date);
    const c: Completion = {
      participantId,
      habitId,
      date,
      completed,
      updatedAt: Date.now(),
    };

    this.db.completions[key] = c;
    this.db.updatedAt = Date.now();
    await this.persist();
  }

  getParticipantHabits(participantId: ParticipantId): Habit[] {
    return Object.values(this.db.habits)
      .filter(h => h.participantId === participantId && !h.archived);
  }

  isCompleted(participantId: ParticipantId, habitId: HabitId, date: IsoDate): boolean {
    const key = completionKey(participantId, habitId, date);
    return this.db.completions[key]?.completed === true;
  }

  private async persist(): Promise<void> {
    if (!this.file) throw new Error("DB file missing");
    if (this.saving) return; // simplistic guard

    this.saving = true;
    try {
      const json = JSON.stringify(this.db, null, 2);
      await this.app.vault.modify(this.file, json);
    } finally {
      this.saving = false;
    }
  }
}
