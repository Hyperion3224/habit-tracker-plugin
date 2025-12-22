import { ItemView, WorkspaceLeaf, Setting, moment } from "obsidian";
import { HabitsDbStore } from "../db";
import { ParticipantId } from "../types";

export const VIEW_TYPE_HABITS_DASHBOARD = "habits-dashboard";

export class DashboardView extends ItemView {
  private store: HabitsDbStore;
  private onOpenParticipant: (participantId: ParticipantId) => void;

  constructor(
    leaf: WorkspaceLeaf,
    store: HabitsDbStore,
    onOpenParticipant: (participantId: ParticipantId) => void
  ) {
    super(leaf);
    this.store = store;
    this.onOpenParticipant = onOpenParticipant;
  }

  getViewType(): string {
    return VIEW_TYPE_HABITS_DASHBOARD;
  }

  getDisplayText(): string {
    return "Habit Tracker Dashboard";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async render(): Promise<void> {
    const root = this.contentEl;
    root.empty();

    const db = this.store.getSnapshot();
    const now = window.moment();
    const monthLabel = now.format("MMMM YYYY");

    root.createEl("h2", { text: `Habit Tracker — ${monthLabel}` });

    // Participant create
    const createWrap = root.createDiv({ cls: "habits-create-participant" });
    new Setting(createWrap)
      .setName("Add participant")
      .addText(t => t.setPlaceholder("Name"))
      .addButton(b => b.setButtonText("Add").setCta().onClick(async () => {
        const input = createWrap.querySelector("input") as HTMLInputElement | null;
        const name = input?.value?.trim() ?? "";
        if (!name) return;
        await this.store.upsertParticipant(name);
        this.render();
      }));

    // Chart placeholder
    const chart = root.createDiv({ cls: "habits-chart" });
    chart.createEl("h3", { text: "Month progress (all participants)" });
    chart.createEl("div", {
      text: "Chart placeholder: wire Chart.js here (labels=days, data=fulfillment%).",
    });

    // Participant list
    root.createEl("h3", { text: "Participants" });

    const list = root.createDiv({ cls: "habits-participant-list" });

    const participants = Object.values(db.participants)
      .filter(p => !p.archived)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (participants.length === 0) {
      list.createEl("p", { text: "No participants yet." });
      return;
    }

    for (const p of participants) {
      const row = list.createDiv({ cls: "habits-participant-row" });
      row.createEl("strong", { text: p.name });

      const openBtn = row.createEl("button", { text: "Open" });
      openBtn.addEventListener("click", () => this.onOpenParticipant(p.id));

      const archiveBtn = row.createEl("button", { text: "Archive" });
      archiveBtn.addEventListener("click", async () => {
        await this.store.archiveParticipant(p.id, true);
        this.render();
      });
    }
  }
}
