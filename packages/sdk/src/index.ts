// contracts 常量打入独立 SDK 产物，不形成运行时包依赖。
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { limits } from "@echo-feedback/contracts/limits";

import { Photos } from "./photos.js";
import { errorMessage, sendSnapshot, type Snapshot, SubmissionError } from "./transport.js";
import type { FeedbackContext, FeedbackInstance, FeedbackOptions } from "./types.js";
import { createView } from "./view.js";

export type { FeedbackContext, FeedbackInstance, FeedbackOptions } from "./types.js";

const noopInstance: FeedbackInstance = {
  open() {
    /* 无 DOM 时安全空操作。 */
  },
  destroy() {
    /* 无资源。 */
  },
};
function safely(callback?: () => void) {
  try {
    callback?.();
  } catch {
    /* 宿主回调异常不进入业务调用栈。 */
  }
}

function sourcePage() {
  const url = new URL(location.href);
  return /^https?:$/.test(url.protocol) ? (url.origin + url.pathname).slice(0, limits.sourcePage) : "";
}

export function init(options: FeedbackOptions): FeedbackInstance {
  const reportError = (error: Error) => safely(() => options?.onError?.(error));
  if (typeof document === "undefined") {
    return noopInstance;
  }

  try {
    const server = new URL(options.serverUrl);
    if (
      !/^https?:$/.test(server.protocol) ||
      server.username ||
      server.password ||
      server.search ||
      server.hash ||
      server.pathname !== "/" ||
      !/^[\w-]{43}$/.test(options.ak)
    ) {
      throw new Error("INVALID_CONFIG");
    }

    const view = createView(options);
    const lifetime = new AbortController();
    let request: AbortController | undefined;
    let context: FeedbackContext = { userId: options.userId, projectVersion: options.projectVersion };
    let page = "";
    let snapshot: Snapshot | undefined;
    let frozen = false;
    let busy = false;
    let destroyed = false;
    let previousFocus: HTMLElement | null = null;
    const status = (message: string, error = false) => {
      view.status.textContent = message;
      view.status.dataset.error = String(error);
    };

    const photos = new Photos(
      view,
      () => {
        snapshot = undefined;
      },
      message => status(message, true)
    );
    const listen = (target: EventTarget, type: string, handler: EventListener) =>
      target.addEventListener(type, handler, { signal: lifetime.signal });
    const lock = (locked: boolean) => {
      view.content.disabled = locked;
      view.contact.disabled = locked;
      photos.lock(locked);
    };

    const syncViewport = () => {
      const viewport = window.visualViewport;
      view.dialog.style.setProperty("--ef-height", `${String(viewport?.height ?? window.innerHeight)}px`);
      view.dialog.style.setProperty("--ef-top", `${String(viewport?.offsetTop ?? 0)}px`);
    };

    const close = () => {
      if (!view.dialog.open) {
        return;
      }

      view.dialog.close();
      safely(() => previousFocus?.focus({ preventScroll: true }));
      safely(options.onClose);
    };

    const open = (next?: FeedbackContext) => {
      if (destroyed || view.dialog.open) {
        return;
      }

      try {
        if (!frozen && !busy) {
          context = { userId: options.userId, projectVersion: options.projectVersion, ...next };
          page = sourcePage();
          snapshot = undefined;
        }

        if (!view.success.hidden) {
          view.success.hidden = true;
          view.form.hidden = false;
        }

        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        syncViewport();
        view.dialog.showModal();
        view.content.focus({ preventScroll: true });
        safely(options.onOpen);
      } catch (error) {
        reportError(error as Error);
      }
    };

    listen(view.trigger, "click", () => open());
    listen(view.close, "click", close);
    listen(view.done, "click", close);
    listen(view.dialog, "cancel", event => {
      event.preventDefault();
      close();
    });
    // 只拦截面板内部输入冒泡，不改写宿主全局处理器。
    ["keydown", "keyup", "keypress", "pointerdown", "pointerup", "click", "wheel", "touchstart", "touchmove"].forEach(
      type => listen(view.dialog, type, event => event.stopPropagation())
    );
    if (window.visualViewport) {
      listen(window.visualViewport, "resize", syncViewport);
      listen(window.visualViewport, "scroll", syncViewport);
    }

    listen(view.content, "input", () => {
      view.count.textContent = `${String(view.content.value.length)} / 2000`;
      snapshot = undefined;
      status("");
    });
    listen(view.contact, "input", () => {
      snapshot = undefined;
    });
    listen(view.add, "click", () => view.file.click());
    listen(view.file, "change", () => photos.add(view.file.files));
    const submit = async () => {
      if (busy || destroyed) {
        return;
      }

      if (!snapshot) {
        const content = view.content.value.trim();
        if (!content) {
          status("请先填写反馈内容。", true);
          return;
        }

        snapshot = {
          key: crypto.randomUUID(),
          files: photos.files,
          metadata: {
            content,
            contact: view.contact.value.trim(),
            userId: context.userId ?? "",
            projectVersion: context.projectVersion ?? "",
            sourcePage: page,
          },
        };
      }

      busy = true;
      request = new AbortController();
      lock(true);
      view.submit.disabled = true;
      view.submit.textContent = "正在提交…";
      status("请稍候，你的反馈正在送达。");
      try {
        await sendSnapshot(server.origin, options.ak, snapshot, request);
        if (destroyed) {
          return;
        }

        snapshot = undefined;
        frozen = false;
        view.content.value = "";
        view.contact.value = "";
        photos.clear();
        view.count.textContent = `0 / ${limits.content}`;
        view.form.hidden = true;
        view.success.hidden = false;
        view.done.focus();
        status("");
      } catch (error) {
        if (destroyed) {
          return;
        }

        const failure = error instanceof SubmissionError ? error : new SubmissionError("NETWORK_ERROR", true);
        frozen = frozen || failure.uncertain;
        if (!frozen) {
          snapshot = undefined;
        }

        status(errorMessage(failure), true);
        reportError(failure);
      } finally {
        busy = false;
        request = undefined;
        if (!destroyed) {
          lock(frozen);
          view.submit.disabled = false;
          view.submit.textContent = frozen ? "重试本次提交" : "提交反馈";
        }
      }
    };

    listen(view.form, "submit", event => {
      event.preventDefault();
      void submit().catch(error => reportError(error as Error));
    });
    return {
      open,
      destroy() {
        if (destroyed) {
          return;
        }

        destroyed = true;
        request?.abort();
        close();
        lifetime.abort();
        photos.clear();
        view.host.remove();
        snapshot = undefined;
      },
    };
  } catch (error) {
    reportError(error as Error);
    return noopInstance;
  }
}
