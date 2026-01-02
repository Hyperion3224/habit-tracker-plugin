import { Plugin, WorkspaceLeaf } from "obsidian";
import { GHTStore } from "./store";
import { GHTSettingTab, DEFAULT_SETTINGS, type GHTPluginSettings } from "./settings";
import { MainView, VIEW_TYPE_MAIN } from "./viewMain";
import { MemberView, VIEW_TYPE_MEMBER } from "./viewMember";

export default class GroupHabitTrackerPlugin extends Plugin {
  settings: GHTPluginSettings = DEFAULT_SETTINGS;
  store!: GHTStore;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.store = new GHTStore(this.app, {
      folder: this.settings.dataFolder,
      filename: this.settings.dbFilename
    });
    await this.store.init();

    this.registerView(VIEW_TYPE_MAIN, (leaf) => new MainView(leaf, this));

    this.registerView(VIEW_TYPE_MEMBER, (leaf) => new MemberView(leaf, this, ""));
    
    this.addRibbonIcon("check-circle", "Group habit tracker", () => {
      void this.openMainView();
    });

    this.addSettingTab(new GHTSettingTab(this.app, this));
    
    this.addCommand({
        id: "open-group-habit-tracker",
        name: "Open group habit tracker",
        callback: () => {
            void this.openMainView();
        }
    });

  }

  onunload(): void {}

  async reinitStore(): Promise<void> {
    this.store = new GHTStore(this.app, {
      folder: this.settings.dataFolder,
      filename: this.settings.dbFilename
    });
    await this.store.init();
  }

  async openMainView(): Promise<void> {
    const leaf = this.getLeafForMain();
    await leaf.setViewState({ type: VIEW_TYPE_MAIN, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async openMemberView(memberId: string): Promise<void> {
    const leaf = this.app.workspace.getLeaf("split", "vertical");

    await leaf.setViewState({
      type: VIEW_TYPE_MEMBER,
      active: true,
      state: { memberId }
    });
    this.app.workspace.revealLeaf(leaf);
  }

  private getLeafForMain(): WorkspaceLeaf {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MAIN);
    const existing = leaves.find((l): l is WorkspaceLeaf => !!l);
    return existing ?? this.app.workspace.getLeaf(true);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
