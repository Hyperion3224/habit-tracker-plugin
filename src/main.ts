import { Plugin, WorkspaceLeaf } from "obsidian";
import { HabitsDbStore } from "./db";
import { DashboardView, VIEW_TYPE_HABITS_DASHBOARD } from "./views/DashboardView";
import { ParticipantView, VIEW_TYPE_HABITS_PARTICIPANT, ParticipantViewState } from "./views/ParticipantView";

export default class HabitTrackerPlugin extends Plugin {
  private store!: HabitsDbStore;

  async onload() {
    this.store = new HabitsDbStore(this.app);
    await this.store.load();

    this.registerView(VIEW_TYPE_HABITS_DASHBOARD, (leaf: WorkspaceLeaf) => {
      return new DashboardView(leaf, this.store, (participantId) => this.openParticipant(participantId));
    });

    this.registerView(VIEW_TYPE_HABITS_PARTICIPANT, (leaf: WorkspaceLeaf) => {
      // default state; will be replaced via setViewState
      return new ParticipantView(leaf, this.store, { participantId: "" });
    });

    this.addRibbonIcon("check-circle", "Open Habit Tracker Dashboard", async () => {
      await this.openDashboard();
    });

    // Optional commands
    this.addCommand({
      id: "open-habit-dashboard",
      name: "Open Habit Tracker Dashboard",
      callback: () => this.openDashboard(),
    });
  }

  async openDashboard(): Promise<void> {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_HABITS_DASHBOARD, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async openParticipant(participantId: string): Promise<void> {
    const leaf = this.app.workspace.getLeaf("tab");
    const state: ParticipantViewState = { participantId };

    await leaf.setViewState({
      type: VIEW_TYPE_HABITS_PARTICIPANT,
      active: true,
    });

    // Ensure view receives state
    const view = leaf.view;
    if (view instanceof ParticipantView) {
      await view.setState(state);
    }

    this.app.workspace.revealLeaf(leaf);
  }
}
