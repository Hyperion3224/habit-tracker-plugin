import { App, Modal, Notice, Setting } from "obsidian";
import type { GHTStore } from "./store";
import type { Recurrence, TaskTemplate, UUID } from "./types";
import { summarizeRecurrence, uuid, displayDow } from "./util";

type ModalContext =
  | { kind: "task"; task?: TaskTemplate; memberId?: UUID } // create/edit template
  | { kind: "occurrence"; occId: UUID; taskId: UUID; memberId: UUID }; // edit occurrence overrides + template

export class TaskModal extends Modal {
  private store: GHTStore;
  private ctx: ModalContext;

  private title = "";
  private notes = "";

  private taskScopeKind: "group" | "individual" = "group";
  private scopeMemberId: UUID | undefined;

  private recType: "daily" | "weekly" | "monthly" = "daily";
  private weeklyDays = new Set<number>([1, 2, 3, 4, 5, 6, 7]); // 1..7 Mon..Sun
  private monthlyMode: "anytime" | "dayOfMonth" | "nthWeekday" = "anytime";
  private monthlyDay = 1;
  private monthlyNth: 1 | 2 | 3 | 4 | 5 = 1;
  private monthlyWeekday = 1;

  // occurrence overrides
  private editOccurrenceOnly = false;
  private overrideTitle = "";
  private overrideNotes = "";

  constructor(app: App, store: GHTStore, ctx: ModalContext) {
    super(app);
    this.store = store;
    this.ctx = ctx;

    if (ctx.kind === "task") {
      const t = ctx.task;
      if (t) {
        this.title = t.title;
        this.notes = t.notes ?? "";
        if (t.scope.type === "group") {
          this.taskScopeKind = "group";
        } else {
          this.taskScopeKind = "individual";
          this.scopeMemberId = t.scope.memberId;
        }
        this.loadRecurrence(t.recurrence);
      } else {
        // create
        this.scopeMemberId = ctx.memberId;
        this.taskScopeKind = ctx.memberId ? "individual" : "group";
      }
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    const db = this.store.getDB();
    const members = db.members.filter(m => !m.deleted);

    contentEl.createEl("div", { cls: "ght-title", text: "Task" });
    if (this.ctx.kind === "occurrence") {
      contentEl.createEl("div", { cls: "ght-subtitle", text: "Editing occurrence (optional override) and template." });
    } else {
      contentEl.createEl("div", { cls: "ght-subtitle", text: "Edit or create a task template." });
    }

    // If opened from occurrence, load the template + occurrence overrides
    if (this.ctx.kind === "occurrence") {
      const occCtx = this.ctx; // narrowed
      const task = db.tasks.find(t => t.id === occCtx.taskId);
      const occ = db.occurrences.find(o => o.id === occCtx.occId);

      if (task) {
        this.title = task.title;
        this.notes = task.notes ?? "";
        if (task.scope.type === "group") this.taskScopeKind = "group";
        else {
          this.taskScopeKind = "individual";
          this.scopeMemberId = task.scope.memberId;
        }
        this.loadRecurrence(task.recurrence);
      }
      if (occ) {
        this.overrideTitle = occ.overrideTitle ?? "";
        this.overrideNotes = occ.overrideNotes ?? "";
      }
    }

    // Occurrence override toggle (only if occurrence context)
    if (this.ctx.kind === "occurrence") {
      new Setting(contentEl)
        .setName("Edit only this occurrence (override)")
        .setDesc("If enabled, changes apply only to this dated instance (useful for this week).")
        .addToggle(t =>
          t.setValue(this.editOccurrenceOnly).onChange(v => {
            this.editOccurrenceOnly = v;
            this.onOpen(); // re-render quickly
          })
        );

      if (this.editOccurrenceOnly) {
        new Setting(contentEl).setName("Override title").addText(t => t.setValue(this.overrideTitle).onChange(v => (this.overrideTitle = v)));
        new Setting(contentEl).setName("Override notes").addTextArea(t =>
          t.setValue(this.overrideNotes).onChange(v => (this.overrideNotes = v))
        );
        contentEl.createEl("hr");
      }
    }

    // Template fields
    new Setting(contentEl).setName("Title").addText(t => t.setValue(this.title).onChange(v => (this.title = v)));

    new Setting(contentEl)
      .setName("Notes")
      .addTextArea(t => t.setValue(this.notes).onChange(v => (this.notes = v)));

    // Scope
    new Setting(contentEl)
      .setName("Scope")
      .setDesc("Group tasks apply to all members automatically.")
      .addDropdown(d => {
        d.addOption("group", "Group");
        d.addOption("individual", "Individual");
        d.setValue(this.taskScopeKind);
        d.onChange(v => {
          this.taskScopeKind = v as any;
          if (this.taskScopeKind === "group") this.scopeMemberId = undefined;
          this.onOpen();
        });
      });

    if (this.taskScopeKind === "individual") {
      new Setting(contentEl)
        .setName("Member")
        .addDropdown(d => {
          for (const m of members) d.addOption(m.id, m.name);
          const chosen = this.scopeMemberId ?? members[0]?.id;
          if (chosen) d.setValue(chosen);
          d.onChange(v => (this.scopeMemberId = v));
        });
    }

    // Recurrence
    contentEl.createEl("hr");
    contentEl.createEl("div", { cls: "ght-title", text: "Recurrence" });

    new Setting(contentEl)
      .setName("Type")
      .addDropdown(d => {
        d.addOption("daily", "Daily");
        d.addOption("weekly", "Weekly (select weekdays)");
        d.addOption("monthly", "Monthly");
        d.setValue(this.recType);
        d.onChange(v => {
          this.recType = v as any;
          this.onOpen();
        });
      });

    if (this.recType === "weekly") {
      const wrap = contentEl.createDiv({ cls: "ght-row" });
      const weekdays: Array<[number, string]> = [
        [1, "Mon"],
        [2, "Tue"],
        [3, "Wed"],
        [4, "Thu"],
        [5, "Fri"],
        [6, "Sat"],
        [7, "Sun"]
      ];
      for (const [iso, label] of weekdays) {
        const btn = wrap.createEl("button", { cls: "ght-btn", text: label });
        if (this.weeklyDays.has(iso)) btn.addClass("is-active");
        btn.onclick = () => {
          if (this.weeklyDays.has(iso)) this.weeklyDays.delete(iso);
          else this.weeklyDays.add(iso);
          this.onOpen();
        };
      }
      contentEl.createEl("div", { cls: "ght-subtitle", text: "Select any combination of weekdays." });
    }

    if (this.recType === "monthly") {
      new Setting(contentEl)
        .setName("Monthly mode")
        .addDropdown(d => {
          d.addOption("anytime", "Once per month (anytime)");
          d.addOption("dayOfMonth", "Specific day of month");
          d.addOption("nthWeekday", "Nth weekday (e.g., 2nd Monday)");
          d.setValue(this.monthlyMode);
          d.onChange(v => {
            this.monthlyMode = v as any;
            this.onOpen();
          });
        });

      if (this.monthlyMode === "dayOfMonth") {
        new Setting(contentEl)
          .setName("Day of month")
          .setDesc("1–31 (will clamp to last day for short months).")
          .addText(t =>
            t.setValue(String(this.monthlyDay)).onChange(v => {
              const n = Number(v);
              if (!Number.isFinite(n)) return;
              this.monthlyDay = Math.max(1, Math.min(31, Math.floor(n)));
            })
          );
      }

      if (this.monthlyMode === "nthWeekday") {
        new Setting(contentEl)
          .setName("Nth")
          .addDropdown(d => {
            for (const n of [1, 2, 3, 4, 5] as const) d.addOption(String(n), `${n}`);
            d.setValue(String(this.monthlyNth));
            d.onChange(v => (this.monthlyNth = Number(v) as any));
          });

        new Setting(contentEl)
          .setName("Weekday")
          .addDropdown(d => {
            for (let iso = 1; iso <= 7; iso++) d.addOption(String(iso), displayDow(iso));
            d.setValue(String(this.monthlyWeekday));
            d.onChange(v => (this.monthlyWeekday = Number(v)));
          });
      }
    }

    // Actions
    contentEl.createEl("hr");

    const buttons = contentEl.createDiv({ cls: "ght-row" });

    const saveBtn = buttons.createEl("button", { cls: "ght-btn", text: "Save" });
    saveBtn.onclick = () => this.handleSave();

    const cancelBtn = buttons.createEl("button", { cls: "ght-btn", text: "Cancel" });
    cancelBtn.onclick = () => this.close();

    // Delete options (template)
    const taskId = this.getTaskIdIfAny();
    if (taskId) {
      const delBtn = buttons.createEl("button", { cls: "ght-btn ght-danger", text: "Delete (unschedule)" });
      delBtn.onclick = () => {
        this.store.softDeleteTask(taskId);
        new Notice("Task deleted (history retained).");
        this.close();
      };

      const purgeBtn = buttons.createEl("button", { cls: "ght-btn ght-danger", text: "Delete + purge history" });
      purgeBtn.onclick = () => {
        this.store.purgeTaskAndHistory(taskId);
        new Notice("Task and history purged.");
        this.close();
      };
    }

    // Helpful summary
    const rec = this.buildRecurrence();
    contentEl.createEl("div", { cls: "ght-subtitle", text: `Recap: ${summarizeRecurrence(rec)}` });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private loadRecurrence(rec: Recurrence): void {
    if (rec.type === "daily") {
      this.recType = "daily";
      return;
    }
    if (rec.type === "weekly") {
      this.recType = "weekly";
      this.weeklyDays = new Set(rec.weekdays);
      return;
    }
    if (rec.type === "monthly") {
      this.recType = "monthly";
      this.monthlyMode = rec.mode;
      if (rec.mode === "dayOfMonth") this.monthlyDay = rec.day;
      if (rec.mode === "nthWeekday") {
        this.monthlyNth = rec.nth;
        this.monthlyWeekday = rec.weekday;
      }
    }
  }

  private buildRecurrence(): Recurrence {
    if (this.recType === "daily") return { type: "daily" };
    if (this.recType === "weekly") {
      const weekdays = Array.from(this.weeklyDays).sort((a, b) => a - b);
      return { type: "weekly", weekdays: weekdays.length ? weekdays : [1] };
    }
    // monthly
    if (this.monthlyMode === "anytime") return { type: "monthly", mode: "anytime" };
    if (this.monthlyMode === "dayOfMonth") return { type: "monthly", mode: "dayOfMonth", day: this.monthlyDay };
    return { type: "monthly", mode: "nthWeekday", nth: this.monthlyNth, weekday: this.monthlyWeekday };
  }

  private getTaskIdIfAny(): UUID | undefined {
    if (this.ctx.kind === "task") return this.ctx.task?.id;
    return this.ctx.taskId;
  }

  private handleSave(): void {
    const title = this.title.trim();
    if (!title) {
      new Notice("Title is required.");
      return;
    }

    if (this.ctx.kind === "occurrence" && this.editOccurrenceOnly) {
      this.store.updateOccurrenceOverrides(this.ctx.occId, this.overrideTitle, this.overrideNotes);
      new Notice("Occurrence updated.");
      this.close();
      return;
    }

    const rec = this.buildRecurrence();
    const db = this.store.getDB();

    let task: TaskTemplate | undefined;
    if (this.ctx.kind === "task") {
      task = this.ctx.task;
    } else {
      const occCtx = this.ctx;
      task = db.tasks.find(t => t.id === occCtx.taskId);
    }

    const id = task?.id ?? uuid();

    const effectiveMemberId = this.scopeMemberId || (this.ctx as any).memberId;

    const scope =
      this.taskScopeKind === "group"
        ? ({ type: "group" } as const)
        : ({ type: "individual", memberId: effectiveMemberId } as const);

    const next: TaskTemplate = {
      id,
      title,
      notes: this.notes.trim() || undefined,
      recurrence: rec,
      scope
    };

    this.store.upsertTask(next);
    new Notice(task ? "Task updated." : "Task created.");
    this.close();
  }
}
