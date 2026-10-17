import { AppError, failure, type Result, type Meaning } from "../shared/types";
import { extractPage } from "../context/extract";
import { resolveSelection } from "../context/selection";
import { showCard, hideCard } from "./card";
import { watchPage } from "./watch";
import type { Message } from "../shared/messages";
export class ContentSession {
  private generation: string | null = null;
  private sequence = 0;
  private unwatch: (() => void) | null = null;
  private onSelect = (event: Event) => {
    if (
      event
        .composedPath()
        .some(
          (el) => el instanceof Element && el.hasAttribute("data-manasi-root"),
        )
    )
      return;
    void this.explainSelection();
  };
  private onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.close();
    else if (event.key === "Shift" || event.key.startsWith("Arrow"))
      this.onSelect(event);
  };
  constructor(private send: (message: Message) => Promise<any>) {
    document.addEventListener("pointerup", this.onSelect);
    document.addEventListener("keyup", this.onKey);
    window.addEventListener("pagehide", this.onPageHide);
  }
  private onPageHide = () => this.deactivate();
  activate(generation: string, url: string, version: string) {
    const page = extractPage(document);
    if (page.url !== url || page.version !== version)
      throw new AppError(
        "stale_context",
        "Sayfa değişti. Eklentiyi yeniden başlatın.",
      );
    this.deactivate();
    this.generation = generation;
    this.unwatch = watchPage(() => {
      const previous = this.generation;
      this.deactivate();
      showCard({ left: 16, top: 16, bottom: 16 } as DOMRect, {
        error: "Sayfa değişti. Eklentiyi açıp yeniden başlatın.",
      });
      if (previous)
        void this.send({ type: "INVALIDATE", generation: previous }).catch(
          () => {},
        );
    });
  }
  close() {
    this.sequence++;
    hideCard();
  }
  deactivate() {
    this.generation = null;
    this.unwatch?.();
    this.unwatch = null;
    this.close();
  }
  dispose() {
    this.deactivate();
    document.removeEventListener("pointerup", this.onSelect);
    document.removeEventListener("keyup", this.onKey);
    window.removeEventListener("pagehide", this.onPageHide);
  }
  async explainSelection() {
    if (!this.generation) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const parent = range.startContainer.parentElement;
    if (
      parent?.closest(
        'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-manasi-root]',
      )
    )
      return;
    const generation = this.generation;
    const id = ++this.sequence;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let anchor: DOMRect;
    try {
      anchor = range.getBoundingClientRect();
    } catch {
      return;
    }
    try {
      const context = resolveSelection(range, document);
      showCard(anchor, { loading: true }, () => this.close());
      const result = await Promise.race<Result<Meaning>>([
        this.send({ type: "EXPLAIN", generation, selection: context }),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new AppError(
                  "timeout",
                  "İstek kesildi veya zaman aşımına uğradı. Kelimeyi yeniden seçerek deneyin.",
                ),
              ),
            60000,
          );
        }),
      ]);
      if (id !== this.sequence || this.generation !== generation) return;
      if (!result?.ok)
        throw new AppError(
          result?.code ?? "connection",
          result?.message ?? "Eklenti bağlantısı kesildi. Yeniden başlatın.",
        );
      showCard(anchor, { meaning: result.value }, () => this.close());
    } catch (error) {
      if (id === this.sequence && this.generation === generation) {
        const result = failure(error);
        showCard(anchor, { error: !result.ok ? result.message : "" }, () =>
          this.close(),
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
