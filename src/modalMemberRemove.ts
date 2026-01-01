import { App, Modal, Notice, Setting } from "obsidian";
import type { GHTStore } from "./store";
import type { UUID } from "./types";

export class RemoveMemberModal extends Modal {
  private store: GHTStore;

  private memberId: UUID | undefined;
  private confirm = false;

  constructor(app: App, store: GHTStore) {
    super(app);
    this.store = store;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    const members = this.store.getDB().members.filter((m) => !m.deleted);

    contentEl.createEl("div", { cls: "ght-title", text: "Remove member" });
    contentEl.createEl("div", {
      cls: "ght-subtitle",
      text: "This is a soft delete: history is retained, but the member will no longer appear."
    });

    if (members.length === 0) {
      contentEl.createEl("div", { cls: "ght-muted", text: "No active members to remove." });
      const row = contentEl.createDiv({ cls: "ght-row" });
      const closeBtn = row.createEl("button", { cls: "ght-btn", text: "Close" });
      closeBtn.onclick = () => this.close();
      return;
    }

    // Always set a definite default
    if (members.length === 0) {
        contentEl.createEl("div", { cls: "ght-muted", text: "No active members to remove." });
        const row = contentEl.createDiv({ cls: "ght-row" });
        const closeBtn = row.createEl("button", { cls: "ght-btn", text: "Close" });
        closeBtn.onclick = () => this.close();
        return;
    }

    // Always set a definite default
    const defaultMemberId: UUID = members[0]!.id;
    this.memberId = this.memberId ?? defaultMemberId;

    new Setting(contentEl)
      .setName("Member")
      .addDropdown((d) => {
        for (const m of members) d.addOption(m.id, m.name);

        // memberId is definitely set here (members.length > 0 and defaulted above)
        d.setValue(this.memberId!);

        d.onChange((v) => {
          this.memberId = v;
          this.confirm = false;
          this.renderConfirm(contentEl);
        });
      });

    this.renderConfirm(contentEl);

    const row = contentEl.createDiv({ cls: "ght-row" });

    const removeBtn = row.createEl("button", { cls: "ght-btn ght-danger", text: "Remove" });
    removeBtn.onclick = () => this.submit();

    const cancelBtn = row.createEl("button", { cls: "ght-btn", text: "Cancel" });
    cancelBtn.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderConfirm(containerEl: HTMLElement): void {
    const existing = containerEl.querySelector(".ght-remove-confirm");
    existing?.remove();

    const wrap = containerEl.createDiv({ cls: "ght-remove-confirm" });

    new Setting(wrap)
      .setName("Confirm removal")
      .setDesc("Enable to confirm you want to remove the selected member.")
      .addToggle((t) => t.setValue(this.confirm).onChange((v) => (this.confirm = v)));
  }

  private submit(): void {
    const memberId = this.memberId;
    if (!memberId) {
      new Notice("No member selected.");
      return;
    }

    if (!this.confirm) {
      new Notice("Please confirm removal first.");
      return;
    }

    this.store.softDeleteMember(memberId);
    new Notice("Member removed (history retained).");
    this.close();
  }
}
