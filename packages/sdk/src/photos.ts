// contracts 常量随 SDK 构建内联。
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { limits } from "@echo-feedback/contracts/limits";

import type { View } from "./view.js";

export class Photos {
  private entries: { file: File; url: string; node: HTMLElement }[] = [];
  constructor(
    private view: View,
    private changed: () => void,
    private report: (message: string) => void
  ) {}
  get files() {
    return this.entries.map(entry => entry.file);
  }
  add(files: FileList | null) {
    Array.from(files ?? []).forEach(file => {
      if (this.entries.length >= limits.images) {
        this.report("最多添加 3 张图片。");
        return;
      }

      if (file.size > limits.imageBytes || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        this.report("请选择 5 MiB 以内的 JPG、PNG 或 WebP 图片。");
        return;
      }

      const url = URL.createObjectURL(file);
      const node = document.createElement("div");
      node.className = "photo";
      const image = document.createElement("img");
      image.src = url;
      image.alt = "待提交图片";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove";
      remove.textContent = "移除";
      remove.setAttribute("aria-label", "移除图片");
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
