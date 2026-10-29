// contracts 常量随 SDK 构建内联。
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { limits } from "@echo-feedback/contracts/limits";

import type { MessageKey } from "./i18n.js";
import type { View } from "./view.js";

export class Photos {
  private entries: { file: File; url: string; node: HTMLElement }[] = [];
  constructor(
    private view: View,
    private changed: () => void,
    private report: (message: MessageKey, params?: Record<string, number>) => void,
    private localize: () => void
  ) {}
  get files() {
    return this.entries.map(entry => entry.file);
  }
  add(files: FileList | null) {
    Array.from(files ?? []).forEach(file => {
      if (this.entries.length >= limits.images) {
        this.report("maxImages", { count: limits.images });
        return;
      }

      if (file.size > limits.imageBytes || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        this.report("invalidImage", { size: limits.imageBytes / 1024 / 1024 });
        return;
      }

      const url = URL.createObjectURL(file);
      const node = document.createElement("div");
      node.className = "photo";
      const image = document.createElement("img");
      image.src = url;
      image.dataset.efAlt = "imageAlt";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove";
      remove.dataset.efText = "remove";
      remove.dataset.efLabel = "removeImage";
      const entry = { file, url, node };
      remove.addEventListener("click", () => {
        this.entries = this.entries.filter(item => item !== entry);
        URL.revokeObjectURL(url);
        node.remove();
        this.refresh();
        this.changed();
      });
      node.append(image, remove);
      this.view.photos.insertBefore(node, this.view.add);
      this.localize();
      this.entries.push(entry);
      this.changed();
    });
    this.view.file.value = "";
    this.refresh();
  }
  lock(locked: boolean) {
    this.view.file.disabled = locked;
    this.view.add.disabled = locked;
    this.view.photos.querySelectorAll("button").forEach(button => {
      button.disabled = locked;
    });
  }
  clear() {
    this.entries.forEach(entry => {
      URL.revokeObjectURL(entry.url);
      entry.node.remove();
    });
    this.entries = [];
    this.refresh();
  }
  private refresh() {
    this.view.add.hidden = this.entries.length >= limits.images;
  }
}
