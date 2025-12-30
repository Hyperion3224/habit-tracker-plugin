import { App, TFile, normalizePath, Vault } from "obsidian";
import type { GHTDB, Member, TaskOccurrence, TaskTemplate, UUID, WindowMode } from "./types";
import { DEFAULT_DB } from "./types";
import { enumerateDates, isTaskDueOnDate, toYMD, uuid, weekKey, startOfIsoWeek, endOfIsoWeek, parseYMD } from "./util";

type Listener = () => void;

export interface StoreSettings {
  folder: string; // vault folder path
  filename: string; // db file name
}

export class GHTStore {
  private app: App;
  private settings: StoreSettings;
  private db: GHTDB = structuredClone(DEFAULT_DB);
  private listeners = new Set<Listener>();
  private writeQueued = false;

  constructor(app: App, settings: StoreSettings) {
    this.app = app;
    this.settings = settings;
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  getDB(): GHTDB {
    return this.db;
  }

  async init(): Promise<void> {
    await this.ensureFolder();
    await this.load();
    await this.housekeepingArchiveOldWeeks();
    await this.save(); // persist housekeeping changes
  }

  private getDBPath(): string {
    return normalizePath(`${this.settings.folder}/${this.settings.filename}`);
  }

  private async ensureFolder(): Promise<void> {
    const folderPath = normalizePath(this.settings.folder);
    const exists = this.app.vault.getAbstractFileByPath(folderPath);
    if (!exists) await this.app.vault.createFolder(folderPath);
  }

  async load(): Promise<void> {
    const path = this.getDBPath();
    const af = this.app.vault.getAbstractFileByPath(path);
    if (!af) {
      this.db = structuredClone(DEFAULT_DB);
      await this.save();
      return;
    }
    if (!(af instanceof TFile)) return;

    const raw = await this.app.vault.read(af);
    try {
      const parsed = JSON.parse(raw) as GHTDB;
      this.db = this.migrate(parsed);
    } catch {
      // If corrupted, keep a safe default but do not destroy original file automatically.
      this.db = structuredClone(DEFAULT_DB);
    }
  }

  private migrate(db: GHTDB): GHTDB {
    if (!db || typeof db !== "object") return structuredClone(DEFAULT_DB);
    if (db.version !== 1) {
      // future: migrations
      return { ...structuredClone(DEFAULT_DB), ...db, version: 1 };
    }
    return db;
  }

  async save(): Promise<void> {
    const path = this.getDBPath();
    const af = this.app.vault.getAbstractFileByPath(path);

    const content = JSON.stringify(this.db, null, 2);

    if (!af) {
      await this.app.vault.create(path, content);
      return;
    }
    if (af instanceof TFile) {
      await this.app.vault.modify(af, content);
    }
  }

  private queueSave(): void {
    if (this.writeQueued) return;
    this.writeQueued = true;

    window.setTimeout(async () => {
      this.writeQueued = false;
      await this.save();
    }, 150);
  }

  // -------- Members --------

  addMember(name: string): Member {
    const member: Member = { id: uuid(), name: name.trim() };
    this.db.members.push(member);
    this.emit();
    this.queueSave();
    return member;
  }

  softDeleteMember(memberId: UUID): void {
    const m = this.db.members.find(x => x.id === memberId);
    if (!m) return;
    m.deleted = true;
    m.deletedAt = new Date().toISOString();
    this.emit();
    this.queueSave();
  }

  // -------- Tasks --------

  upsertTask(task: TaskTemplate): void {
    const i = this.db.tasks.findIndex(t => t.id === task.id);
    if (i >= 0) this.db.tasks[i] = task;
    else this.db.tasks.push(task);
    this.emit();
    this.queueSave();
  }

  softDeleteTask(taskId: UUID): void {
    const t = this.db.tasks.find(x => x.id === taskId);
    if (!t) return;
    t.deleted = true;
    t.deletedAt = new Date().toISOString();
    this.emit();
    this.queueSave();
  }

  purgeTaskAndHistory(taskId: UUID): void {
    this.db.tasks = this.db.tasks.filter(t => t.id !== taskId);
    this.db.occurrences = this.db.occurrences.filter(o => o.taskId !== taskId);
    this.emit();
    this.queueSave();
  }

  // -------- Occurrences (spawning + updates) --------

  /**
   * Ensure occurrences exist for all due tasks in the date window.
   * Returns occurrences for rendering.
   */
  ensureOccurrences(mode: WindowMode, anchor: Date, memberId?: UUID): TaskOccurrence[] {
    const dates = enumerateDates(mode, anchor);
    const members = this.db.members.filter(m => !m.deleted);

    const targetMembers = memberId ? members.filter(m => m.id === memberId) : members;
    const activeTasks = this.db.tasks.filter(t => !t.deleted);

    const out: TaskOccurrence[] = [];

    for (const d of dates) {
      const ymd = toYMD(d);
      const wk = weekKey(d);

      for (const m of targetMembers) {
        const relevantTasks = activeTasks.filter(t => {
          if (t.scope.type === "group") return true;
          return t.scope.memberId === m.id;
        });

        for (const t of relevantTasks) {
          if (!isTaskDueOnDate(t, d)) continue;

          let occ = this.db.occurrences.find(o => o.memberId === m.id && o.taskId === t.id && o.date === ymd);
          if (!occ) {
            occ = {
              id: uuid(),
              taskId: t.id,
              memberId: m.id,
              date: ymd,
              weekKey: wk,
              titleSnapshot: t.title,
              notesSnapshot: t.notes,
              status: "pending",
              archived: false
            };
            this.db.occurrences.push(occ);
            this.queueSave();
          }
          out.push(occ);
        }
      }
    }

    return out;
  }

  setOccurrenceStatus(occId: UUID, status: "pending" | "complete" | "incomplete"): void {
    const occ = this.db.occurrences.find(o => o.id === occId);
    if (!occ) return;
    occ.status = status;
    this.emit();
    this.queueSave();
  }

  updateOccurrenceOverrides(occId: UUID, overrideTitle?: string, overrideNotes?: string): void {
    const occ = this.db.occurrences.find(o => o.id === occId);
    if (!occ) return;
    occ.overrideTitle = overrideTitle?.trim() || undefined;
    occ.overrideNotes = overrideNotes?.trim() || undefined;
    this.emit();
    this.queueSave();
  }

  // -------- Weekly archiving --------

  /**
   * When we enter a new week, archive any unarchived occurrences from prior weeks.
   * Pending becomes incomplete. Complete remains complete.
   */
  async housekeepingArchiveOldWeeks(today = new Date()): Promise<void> {
    const now = new Date(today);
    now.setHours(0, 0, 0, 0);

    const currentWeekStart = startOfIsoWeek(now); // Mon 00:00
    const cutoff = currentWeekStart.getTime();

    let changed = false;

    for (const occ of this.db.occurrences) {
      if (occ.archived) continue;
      const d = parseYMD(occ.date);
      if (d.getTime() < cutoff) {
        // belongs to a prior week
        occ.archived = true;
        if (occ.status === "pending") occ.status = "incomplete";
        changed = true;
      }
    }

    if (changed) {
      this.emit();
      this.queueSave();
    }
  }
}
