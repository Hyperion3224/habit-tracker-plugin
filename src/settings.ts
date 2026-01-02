import { App, PluginSettingTab, Setting } from "obsidian";
import type GroupHabitTrackerPlugin from "./main";

export interface GHTPluginSettings {
  dataFolder: string;
  dbFilename: string;
}

export const DEFAULT_SETTINGS: GHTPluginSettings = {
  dataFolder: "GroupHabitTracker",
  dbFilename: "db.json"
};

export class GHTSettingTab extends PluginSettingTab {
  plugin: GroupHabitTrackerPlugin;

  constructor(app: App, plugin: GroupHabitTrackerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Data folder")
      .setDesc("Vault folder where Group Habit Tracker stores its JSON database.")
      .addText(t =>
        t
          .setValue(this.plugin.settings.dataFolder)
          .onChange(async value => {
            this.plugin.settings.dataFolder = value.trim() || "GroupHabitTracker";
            await this.plugin.saveSettings();
            await this.plugin.reinitStore();
          })
      );

    new Setting(containerEl)
      .setName("Data folder") 
      .setDesc("Vault folder where group habit tracker stores its JSON database.") 
      .addText(t =>
        t
          .setValue(this.plugin.settings.dbFilename)
          .onChange(async value => {
            this.plugin.settings.dbFilename = value.trim() || "db.json";
            await this.plugin.saveSettings();
            await this.plugin.reinitStore();
          })
      );
  }
}
