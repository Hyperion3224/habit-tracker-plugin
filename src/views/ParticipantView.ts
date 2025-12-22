import { ItemView, WorkspaceLeaf, Setting, moment } from "obsidian";
import { HabitsDbStore } from "../db";
import { ParticipantId, IsoDate } from "../types";

export const VIEW_TYPE_HABITS_PARTICIPANT = "habits-participant";

export interface ParticipantViewState {
  participantId: ParticipantId;
}

export class ParticipantView extends ItemView {
  private store: HabitsDbStore;
  private stateData: ParticipantViewState;

  constructor(leaf: WorkspaceLeaf, store: HabitsDbStore, state: ParticipantViewState) {
    super(leaf);
    this.store = store;
    this.stateData = state;
  }

  getViewType(): string {
    return VIEW_TYPE_HABITS_PARTICIPANT;
  }

  getDisplayText(): string {
    return "Participant Habits";
  }

  

  async setState(state: ParticipantViewState): Promise<void> {
    this.stateData = state;
    this.render();
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  private todayIso(): IsoDate {
    return window.moment().format("YYYY-MM-DD");
  }

  async render(): Promise<void> {
    const root = this.contentEl;
    root.empty();

    const db = this.store.getSnapshot();
    const participant = db.participants[this.stateData.participantId];

    if (!participant || participant.archived) {
      root.createEl("p", { text: "Participant not found (or archived)." });
      return;
    }

    const today = this.todayIso();

    root.createEl("h2", { text: `${participant.name}` });
    root.createEl("div", { text: `Today: ${today}` });

    // Add habit
    const add = root.createDiv({ cls: "habits-add-habit" });
    new Setting(add)
      .setName("Add habit")
      .addText(t => t.setPlaceholder("Habit name"))
      .addButton(b => b.setButtonText("Add").setCta().onClick(async () => {
        const input = add.querySelector("input") as HTMLInputElement | null;
        const name = input?.value?.trim() ?? "";
        if (!name) return;
        await this.store.addHabit(this.stateData.participantId, name);
        this.render();
      }));

    // Habits checklist (today)
    root.createEl("h3", { text: "Today" });

    const habits = this.store.getParticipantHabits(this.stateData.participantId)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (habits.length === 0) {
      root.createEl("p", { text: "No habits defined yet." });
      return;
    }

    const list = root.createDiv({ cls: "habits-today-list" });

    for (const h of habits) {
      const row = list.createDiv({ cls: "habits-today-row" });

      const checked = this.store.isCompleted(this.stateData.participantId, h.id, today);
      const cb = row.createEl("input");
      cb.type = "checkbox";
      cb.checked = checked;

      const label = row.createEl("span", { text: ` ${h.name}` });

      cb.addEventListener("change", async () => {
        await this.store.setCompletion(this.stateData.participantId, h.id, today, cb.checked);
        // no heavy re-render required, but keep it simple
      });

      // Habit controls
      const controls = row.createDiv({ cls: "habits-controls" });

      const renameBtn = controls.createEl("button", { text: "Rename" });
      renameBtn.addEventListener("click", async () => {
        const newName = prompt("Rename habit:", h.name);
        if (!newName?.trim()) return;
        await this.store.renameHabit(h.id, newName.trim());
        this.render();
      });

      const archiveBtn = controls.createEl("button", { text: "Archive" });
      archiveBtn.addEventListener("click", async () => {
        await this.store.archiveHabit(h.id, true);
        this.render();
      });
    }
  }
}
