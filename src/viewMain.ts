import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type GroupHabitTrackerPlugin from "./main";
import type { TaskOccurrence, WindowMode } from "./types";
import { toYMD, enumerateDates, occurrenceLabel } from "./util";
import { TaskModal } from "./modalTask";
import { AddMemberModal } from "./modalMemberAdd";
import { RemoveMemberModal } from "./modalMemberRemove";

import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend
} from "chart.js";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

export const VIEW_TYPE_MAIN = "ght-main";

export class MainView extends ItemView {
  private plugin: GroupHabitTrackerPlugin;
  private unsubscribe?: () => void;

  private mode: WindowMode = "week";
  private chart?: Chart;
  private canvas?: HTMLCanvasElement;

  constructor(leaf: WorkspaceLeaf, plugin: GroupHabitTrackerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_MAIN;
  }

  getDisplayText(): string {
    return "Group Habit Tracker";
  }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.plugin.store.onChange(() => this.render());
    await this.plugin.store.housekeepingArchiveOldWeeks();
    this.render();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.destroyChart();
  }

  private destroyChart(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = undefined;
    }
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("ght-root");

    const db = this.plugin.store.getDB();
    const members = db.members.filter(m => !m.deleted);

    root.createEl("div", { cls: "ght-title", text: "Group Habit Tracker" });

    // Mode selector
    const modeRow = root.createDiv({ cls: "ght-row" });
    modeRow.createEl("span", { cls: "ght-muted", text: "Window:" });

    const select = modeRow.createEl("select", { cls: "ght-select" });
    for (const m of ["day", "week", "month"] as WindowMode[]) {
      const opt = select.createEl("option", { value: m, text: m.toUpperCase() });
      if (m === this.mode) opt.selected = true;
    }
    select.onchange = () => {
      this.mode = select.value as WindowMode;
      this.render();
    };

    // Chart card
    const chartCard = root.createDiv({ cls: "ght-card" });
    chartCard.createEl("div", { cls: "ght-title", text: "Group progress" });
    chartCard.createEl("div", { cls: "ght-subtitle", text: "Completion % of due occurrences per day." });

    this.canvas = chartCard.createEl("canvas");
    this.renderChart();

    // Members card
    const memberCard = root.createDiv({ cls: "ght-card" });
    memberCard.createEl("div", { cls: "ght-title", text: "Members" });

    const memberRow = memberCard.createDiv({ cls: "ght-members" });
    for (const m of members) {
      const pill = memberRow.createDiv({ cls: "ght-pill", text: m.name });
      pill.onclick = () => this.plugin.openMemberView(m.id);
    }

    const memberActions = memberCard.createDiv({ cls: "ght-row" });
    const addBtn = memberActions.createEl("button", { cls: "ght-btn", text: "Add member" });
    addBtn.onclick = () => {
      new AddMemberModal(this.app, this.plugin.store).open();
    };


    const rmBtn = memberActions.createEl("button", { cls: "ght-btn ght-danger", text: "Remove member" });
    rmBtn.onclick = () => {
      new RemoveMemberModal(this.app, this.plugin.store).open();
    };


    // Group task management card
    const groupTaskCard = root.createDiv({ cls: "ght-card" });
    groupTaskCard.createEl("div", { cls: "ght-title", text: "Group tasks" });
    groupTaskCard.createEl("div", { cls: "ght-subtitle", text: "These apply to all members automatically." });

    const addGroupTask = groupTaskCard.createEl("button", { cls: "ght-btn", text: "Add group task" });
    addGroupTask.onclick = () => new TaskModal(this.app, this.plugin.store, { kind: "task" }).open();

    const groupTasks = db.tasks.filter(t => !t.deleted && t.scope.type === "group");
    const list = groupTaskCard.createDiv({ cls: "ght-tasklist" });
    for (const t of groupTasks) {
      const row = list.createDiv({ cls: "ght-task" });
      row.createEl("div"); // empty slot for checkbox placeholder
      const title = row.createEl("div", { cls: "ght-task-title", text: t.title });
      title.onclick = () => new TaskModal(this.app, this.plugin.store, { kind: "task", task: t }).open();
      const edit = row.createEl("button", { cls: "ght-btn", text: "Edit" });
      edit.onclick = () => new TaskModal(this.app, this.plugin.store, { kind: "task", task: t }).open();
    }

    // Today overview (group+individual mixed per member)
    const todayCard = root.createDiv({ cls: "ght-card" });
    todayCard.createEl("div", { cls: "ght-title", text: "Today" });

    const today = new Date();
    const occs = this.plugin.store.ensureOccurrences("day", today);
    // Render by member
    for (const m of members) {
      todayCard.createEl("div", { cls: "ght-subtitle", text: m.name });
      const memberOccs = occs.filter(o => o.memberId === m.id && !o.archived);
      const memberList = todayCard.createDiv({ cls: "ght-tasklist" });
      for (const occ of memberOccs) {
        const row = memberList.createDiv({ cls: "ght-task" });

        const cb = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
        cb.checked = occ.status === "complete";
        cb.onchange = async () => {
          this.plugin.store.setOccurrenceStatus(occ.id, cb.checked ? "complete" : "pending");
          await this.plugin.store.housekeepingArchiveOldWeeks();
        };

        const label = row.createEl("div", { cls: "ght-task-title", text: occurrenceLabel(occ) });
        label.onclick = () => new TaskModal(this.app, this.plugin.store, { kind: "occurrence", occId: occ.id, taskId: occ.taskId, memberId: occ.memberId }).open();

        const edit = row.createEl("button", { cls: "ght-btn", text: "Edit" });
        edit.onclick = () => new TaskModal(this.app, this.plugin.store, { kind: "occurrence", occId: occ.id, taskId: occ.taskId, memberId: occ.memberId }).open();
      }
    }
  }

  private renderChart(): void {
    if (!this.canvas) return;

    this.destroyChart();

    const db = this.plugin.store.getDB();
    const members = db.members.filter(m => !m.deleted);

    const today = new Date();
    const dates = enumerateDates(this.mode, today);

    // Ensure occurrences exist for the window
    const occs = this.plugin.store.ensureOccurrences(this.mode, today);

    const labels = dates.map(d => toYMD(d));
    const data = labels.map(label => {
      const due = occs.filter(o => o.date === label && !o.archived && members.some(m => m.id === o.memberId));
      if (due.length === 0) return 0;
      const complete = due.filter(o => o.status === "complete").length;
      return Math.round((complete / due.length) * 100);
    });

    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    this.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Group completion %",
            data,
            tension: 0.25
          }
        ]
      },
      options: {
        responsive: true,
        animation: false,
        scales: {
          y: { min: 0, max: 100 }
        }
      }
    });
  }
}
