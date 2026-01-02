import { ItemView, WorkspaceLeaf, ViewStateResult } from "obsidian";
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

interface MemberViewState {
    memberId: string;
}

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
    return m ? `Member: ${m.name}` : "Unknown member";
  }

  public getMemberId(): string {
    return this.memberId;
  } 

  async setState(state: MemberViewState, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);
    this.memberId = state.memberId ?? "";
    this.render();
  }

  // FIX: This ensures the memberId is updated when the view state is set
  async setViewState(state: any, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);
    this.memberId = state.memberId ?? "";
    this.render();
  }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.plugin.store.onChange(() => this.render());
    await this.plugin.store.housekeepingArchiveOldWeeks();
    this.render();
  }

  async onClose(): Promise<void> {
    if (this.unsubscribe) this.unsubscribe();
    if (this.chart) this.chart.destroy();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ght-view");

    const m = this.plugin.store.getDB().members.find(x => x.id === this.memberId);
    if (!m) {
      contentEl.createEl("h2", { text: "Unknown member" });
      return;
    }

    contentEl.createEl("h2", { text: m.name });

    // Mode toggles
    const modes: WindowMode[] = ["day", "week", "month"];
    const modeRow = contentEl.createDiv({ cls: "ght-row" });
    for (const mo of modes) {
      const btn = modeRow.createEl("button", {
        cls: `ght-btn ${this.mode === mo ? "ght-active" : ""}`,
        text: mo.toUpperCase()
      });
      btn.onclick = () => {
        this.mode = mo;
        this.render();
      };
    }

    // Chart container
    const chartWrap = contentEl.createDiv({ cls: "ght-chart-wrap" });
    this.canvas = chartWrap.createEl("canvas");
    this.renderChart();

    // Task list
    const root = contentEl.createDiv({ cls: "ght-member-tasks" });
    const today = new Date();
    const occs = this.plugin.store.ensureOccurrences(this.mode, today, this.memberId);

    if (occs.length === 0) {
      root.createEl("div", { cls: "ght-muted", text: "No tasks for this period." });
    } else {
      for (const occ of occs) {
        const row = root.createDiv({ cls: "ght-task-row" });
        const label = occurrenceLabel(occ);
        const text = row.createDiv({ cls: "ght-task-text" });
        text.createSpan({ cls: "ght-task-title", text: occ.overrideTitle || occ.titleSnapshot });
        text.createDiv({ cls: "ght-task-meta", text: `${label} • ${occ.date}` });

        const status = row.createEl("select", { cls: "ght-status-select" });
        ["pending", "complete", "incomplete"].forEach(s => {
          const opt = status.createEl("option", { text: s, value: s });
          if (occ.status === s) opt.selected = true;
        });
        status.onchange = () => {
          const val = status.value as "pending" | "complete" | "incomplete";
          this.plugin.store.setOccurrenceStatus(occ.id, val);
        };

        const edit = row.createEl("button", { cls: "ght-btn", text: "Edit" });
        edit.onclick = () => new TaskModal(this.app, this.plugin.store, { kind: "occurrence", occId: occ.id, taskId: occ.taskId, memberId: occ.memberId }).open();
      }
    }

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
        datasets: [{
          label: "Completion %",
          data,
          borderColor: "rgba(75, 192, 192, 1)",
          tension: 0.1,
          fill: false
        }]
      },
      options: {
        scales: {
          y: { min: 0, max: 100 }
        }
      }
    });
  }
}