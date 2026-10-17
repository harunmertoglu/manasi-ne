import { chunkText } from "../context/chunks";
import { cacheKey } from "../context/cache";
import { validatePage } from "../shared/messages";
import {
  AppError,
  failure,
  type Meaning,
  type PageContent,
  type PageState,
  type ProviderId,
  type Result,
  type SelectionContext,
  type Settings,
  type StorageArea,
} from "../shared/types";
import { SessionStore } from "./state";
type Client = {
  summarize(text: string): Promise<string>;
  explain(
    page: PageContent,
    summary: string,
    selection: SelectionContext,
  ): Promise<Meaning>;
};
export class PageController {
  private store: SessionStore;
  private generations = new Map<number, string>();
  private pending = new Map<string, Promise<Result<Meaning>>>();
  private sequence = 0;
  constructor(
    area: StorageArea,
    private settings: () => Promise<Settings | null>,
    private factory: (settings: Settings) => Client,
    private notify: (state: PageState) => Promise<void> = async () => {},
  ) {
    this.store = new SessionStore(area);
  }
  reserveStart(tabId: number): string {
    const generation = `g-${Date.now()}-${++this.sequence}`;
    this.generations.set(tabId, generation);
    return generation;
  }
  private matches(tabId: number, generation: string): boolean {
    return this.generations.get(tabId) === generation;
  }
  assertCurrent(tabId: number, generation: string): void {
    if (!this.matches(tabId, generation))
      throw new AppError(
        "stale_context",
        "İşlem durduruldu veya sayfa değişti. Yeniden başlatın.",
      );
  }
  async recover() {
    for (const record of await this.store.all()) {
      if (!this.generations.has(record.state.tabId))
        this.generations.set(record.state.tabId, record.state.generation);
      if (record.state.status === "preparing")
        await this.store.update(record.state.tabId, (r) =>
          r
            ? {
                ...r,
                state: {
                  ...r.state,
                  status: "error",
                  error: "Hazırlık kesildi. Bu sayfada yeniden başlatın.",
                },
              }
            : null,
        );
    }
  }
  async status(tabId: number): Promise<PageState | null> {
    return (await this.store.get(tabId))?.state ?? null;
  }
  async start(
    tabId: number,
    input: PageContent,
    generation = this.reserveStart(tabId),
  ): Promise<Result<PageState>> {
    try {
      this.assertCurrent(tabId, generation);
      const page = validatePage(input);
      const chunks = chunkText(page.paragraphs);
      const settings = await this.settings();
      this.assertCurrent(tabId, generation);
      if (!settings?.validated)
        throw new AppError(
          "missing_key",
          "Önce ayarlardan bir sağlayıcı bağlayıp doğrulayın.",
        );
      const state: PageState = {
        tabId,
        generation,
        page,
        status: "preparing",
        summary: "",
        updatedAt: Date.now(),
        progress: `0 / ${chunks.length} bölüm`,
      };
      await this.store.update(tabId, (record) =>
        this.matches(tabId, generation) ? { state, cache: [] } : record,
      );
      this.assertCurrent(tabId, generation);
      void this.prepare(state, chunks, this.factory(settings));
      return { ok: true, value: state };
    } catch (error) {
      return failure(error);
    }
  }
  private async prepare(initial: PageState, chunks: string[], client: Client) {
    const { tabId, generation } = initial;
    try {
      const summaries: string[] = [];
      for (const chunk of chunks) {
        if (!this.matches(tabId, generation)) return;
        summaries.push(await client.summarize(chunk));
        await this.store.update(tabId, (r) =>
          r &&
          r.state.generation === generation &&
          r.state.status === "preparing"
            ? {
                ...r,
                state: {
                  ...r.state,
                  progress: `${summaries.length} / ${chunks.length} bölüm`,
                  updatedAt: Date.now(),
                },
              }
            : r,
        );
      }
      if (!this.matches(tabId, generation)) return;
      const summary =
        summaries.length === 1
          ? summaries[0]
          : await client.summarize(summaries.join("\n"));
      await this.store.update(tabId, (r) =>
        r && this.matches(tabId, generation) && r.state.status === "preparing"
          ? {
              ...r,
              state: {
                ...r.state,
                summary,
                status: "ready",
                updatedAt: Date.now(),
                progress: undefined,
              },
            }
          : r,
      );
      const state = await this.status(tabId);
      if (
        state?.generation === generation &&
        state.status === "ready" &&
        this.matches(tabId, generation)
      )
        await this.notify(state);
    } catch (error) {
      const result = failure(error);
      await this.store
        .update(tabId, (r) =>
          r &&
          this.matches(tabId, generation) &&
          r.state.generation === generation
            ? {
                ...r,
                state: {
                  ...r.state,
                  status: "error",
                  error: !result.ok ? result.message : "İşlem tamamlanamadı.",
                  updatedAt: Date.now(),
                },
              }
            : r,
        )
        .catch(() => {});
    }
  }
  async stop(
    tabId: number,
    generation = this.reserveStart(tabId),
  ): Promise<boolean> {
    await this.store.update(tabId, (record) =>
      this.matches(tabId, generation) ? null : record,
    );
    return this.matches(tabId, generation);
  }
  async invalidate(tabId: number) {
    const generation = this.reserveStart(tabId);
    await this.store.update(tabId, (r) =>
      r && this.matches(tabId, generation)
        ? {
            state: {
              ...r.state,
              status: "stale",
              summary: "",
              updatedAt: Date.now(),
              error: "Sayfa değişti. Yeni bağlam için yeniden başlatın.",
            },
            cache: [],
          }
        : r,
    );
  }
  async stopAll(): Promise<number[]> {
    // Reserve cancellation tokens before the first await, including starts that
    // are waiting for extraction/settings and have not reached storage yet.
    const tokens = new Map(
      [...this.generations.keys()].map((tabId) => [
        tabId,
        this.reserveStart(tabId),
      ]),
    );
    for (const record of await this.store.all()) {
      const tabId = record.state.tabId;
      if (!this.generations.has(tabId))
        tokens.set(tabId, this.reserveStart(tabId));
    }
    const stopped: number[] = [];
    for (const [tabId, token] of tokens)
      if (await this.stop(tabId, token)) stopped.push(tabId);
    return stopped;
  }
  async explain(
    tabId: number,
    generation: string,
    selection: SelectionContext,
  ): Promise<Result<Meaning>> {
    try {
      const record = await this.store.get(tabId);
      if (
        !record ||
        record.state.status !== "ready" ||
        record.state.generation !== generation ||
        !this.matches(tabId, generation)
      )
        throw new AppError(
          "stale_context",
          "Sayfa bağlamı hazır değil veya değişti. Eklentiyi yeniden başlatın.",
        );
      const settings = await this.settings();
      this.assertCurrent(tabId, generation);
      if (!settings?.validated)
        throw new AppError(
          "missing_key",
          "Sağlayıcı ayarlarınızı doğrulayın.",
        );
      const provider: ProviderId = settings.provider ?? "groq";
      const accountId =
        settings.provider === "chatgpt" ? settings.accountId : "";
      const key = cacheKey(
        record.state.page,
        selection,
        settings.model,
        provider,
        accountId,
      );
      const cached = record.cache.find((c) => c.key === key);
      if (cached) return { ok: true, value: cached.value };
      const pendingKey = `${tabId}:${generation}:${key}`;
      const existing = this.pending.get(pendingKey);
      if (existing) return existing;
      const work = (async (): Promise<Result<Meaning>> => {
        try {
          const value = await this.factory(settings).explain(
            record.state.page,
            record.state.summary,
            selection,
          );
          if (!this.matches(tabId, generation))
            throw new AppError(
              "stale_context",
              "Sayfa değişti. Eklentiyi yeniden başlatın.",
            );
          await this.store.update(tabId, (r) =>
            r &&
            r.state.generation === generation &&
            r.state.status === "ready" &&
            this.matches(tabId, generation)
              ? {
                  ...r,
                  cache: [
                    ...r.cache.filter((c) => c.key !== key),
                    { key, value },
                  ].slice(-100),
                }
              : r,
          );
          if (!this.matches(tabId, generation))
            throw new AppError(
              "stale_context",
              "Sayfa değişti. Eklentiyi yeniden başlatın.",
            );
          return { ok: true, value };
        } catch (error) {
          return failure(error);
        }
      })();
      this.pending.set(pendingKey, work);
      try {
        return await work;
      } finally {
        this.pending.delete(pendingKey);
      }
    } catch (error) {
      return failure(error);
    }
  }
}
