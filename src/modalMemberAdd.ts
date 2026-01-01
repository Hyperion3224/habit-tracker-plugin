import { App, Modal, Notice, Setting } from "obsidian";
import type { GHTStore } from "./store";

export class AddMemberModal extends Modal {
  private store: GHTStore;
  private name = "";

  constructor(app: App, store: GHTStore) {
    super(app);
    this.store = store;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("div", { cls: "ght-title", text: "Add member" });
    contentEl.createEl("div", { cls: "ght-subtitle", text: "Enter a member name." });

    let inputEl: HTMLInputElement | null = null;

    new Setting(contentEl)
      .setName("Name")
      .addText((t) => {
        t.setPlaceholder("e.g., Alice");
        t.onChange((v) => (this.name = v));
        inputEl = t.inputEl;
      });

    // Focus after render
    window.setTimeout(() => inputEl?.focus(), 0);

    const row = contentEl.createDiv({ cls: "ght-row" });

    const addBtn = row.createEl("button", { cls: "ght-btn", text: "Add" });
    addBtn.onclick = () => this.submit();

    const cancelBtn = row.createEl("button", { cls: "ght-btn", text: "Cancel" });
    cancelBtn.onclick = () => this.close();

    contentEl.addEventListener("keydown", (ev: KeyboardEvent) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this.submit();
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private submit(): void {
    const name = this.name.trim();
    if (!name) {
      new Notice("Member name is required.");
      return;
    }

    const existing = this.store
      .getDB()
      .members
      .filter((m) => !m.deleted)
      .some((m) => m.name.toLowerCase() === name.toLowerCase());

    if (existing) {
      new Notice("A member with that name already exists.");
      return;
    }

    this.store.addMember(name);
    new Notice("Member added.");
    this.close();
  }
}
