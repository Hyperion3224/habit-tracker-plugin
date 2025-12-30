import { ItemView, WorkspaceLeaf } from "obsidian";
import type GroupHabitTrackerPlugin from "./main";
import type { UUID, WindowMode } from "./types";
import { enumerateDates, toYMD, occurrenceLabel } from "./util";
import { TaskModal } from "./modalTask";

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

export const VIEW_TYPE_MEMBER = "ght-member";

export class MemberView extends ItemView {
  private plugin: GroupHabitTrackerPlugin;
  private memberId: UUID;

  private unsubscribe?: () => void;

  private mode: WindowMode = "week";
  private chart?: Chart;
  private canvas?: HTMLCanvasElement;

  constructor(leaf: WorkspaceLeaf, plugin: GroupHabitTrackerPlugin, memberId: UUID) {
    super(leaf);
    this.plugin = plugin;
    this.memberId = memberId;
  }

  getViewType(): string {
    return VIEW_TYPE_MEMBER;
  }

  getDisplayText(): string {
    const m = this.plugin.store.getDB().members.find(x => x.id === this.memberId);
    return m ? `Member: ${m.name}` : "Member";
  }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.plugin.store.onChange(() => this.render());
    await this.plugin.store.housekeepingArchiveOldWeeks();
    this.render();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    if (this.chart) this.chart.destroy();
  }

  setMember(memberId: UUID): void {
    this.memberId = memberId;
    this.render();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("ght-root");

    const db = this.plugin.store.getDB();
    const member = db.members.find(m => m.id === this.memberId);

    root.createEl("div", { cls: "ght-title", text: member ? member.name : "Unknown member" });

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

    // Chart
    const chartCard = root.createDiv({ cls: "ght-card" });
    chartCard.createEl("div", { cls: "ght-title", text: "Progress" });
    chartCard.createEl("div", { cls: "ght-subtitle", text: "Completion % of due occurrences per day." });

    this.canvas = chartCard.createEl("canvas");
    this.renderChart();

    // Task list for selected window, with checkboxes
    const listCard = root.createDiv({ cls: "ght-card" });
    listCard.createEl("div", { cls: "ght-title", text: "Tasks" });
    listCard.createEl("div", { cls: "ght-subtitle", text: "Click a task to edit in a modal." });

    const today = new Date();
    const occs = this.plugin.store.ensureOccurrences(this.mode, today, this.memberId).filter(o => !o.archived);

    // Group by date label
    const byDate = new Map<string, typeof occs>();
    for (const o of occs) {
      if (!byDate.has(o.date)) byDate.set(o.date, []);
      byDate.get(o.date)!.push(o);
    }

    const dates = enumerateDates(this.mode, today).map(d => toYMD(d));
    for (const date of dates) {
      const dayOccs = (byDate.get(date) ?? []).slice().sort((a, b) => (a.taskId > b.taskId ? 1 : -1));
      if (dayOccs.length === 0) continue;

      listCard.createEl("div", { cls: "ght-subtitle", text: date });

      const ul = listCard.createDiv({ cls: "ght-tasklist" });
      for (const occ of dayOccs) {
        const row = ul.createDiv({ cls: "ght-task" });

        const cb = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
        cb.checked = occ.status === "complete";
        cb.onchange = async () => {
          this.plugin.store.setOccurrenceStatus(occ.id, cb.checked ? "complete" : "pending");
          await this.plugin.store.housekeepingArchiveOldWeeks();
        };

        const label = row.createEl("div", { cls: "ght-task-title", text: occurrenceLabel(occ) });
        label.onclick = () =>
          new TaskModal(this.app, this.plugin.store, { kind: "occurrence", occId: occ.id, taskId: occ.taskId, memberId: occ.memberId }).open();

        const edit = row.createEl("button", { cls: "ght-btn", text: "Edit" });
        edit.onclick = () =>
          new TaskModal(this.app, this.plugin.store, { kind: "occurrence", occId: occ.id, taskId: occ.taskId, memberId: occ.memberId }).open();
      }
    }

    // Add individual task shortcut
    const addRow = root.createDiv({ cls: "ght-row" });
    const addBtn = addRow.createEl("button", { cls: "ght-btn", text: "Add individual task" });
    addBtn.onclick = () => new TaskModal(this.app, this.plugin.store, { kind: "task", memberId: this.memberId }).open();
  }

  private renderChart(): void {
    if (!this.canvas) return;
    if (this.chart) this.chart.destroy();

    const today = new Date();
    const dates = enumerateDates(this.mode, today);
    const labels = dates.map(d => toYMD(d));

    const occs = this.plugin.store.ensureOccurrences(this.mode, today, this.memberId);

    const data = labels.map(label => {
      const due = occs.filter(o => o.date === label && !o.archived);
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
            label: "Completion %",
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
