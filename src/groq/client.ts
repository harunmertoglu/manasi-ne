import {
  AppError,
  type Settings,
  type ModelOption,
  type PageContent,
  type SelectionContext,
  type Meaning,
} from "../shared/types";
import { summaryPrompt, meaningPrompt } from "./prompts";
import { parseJSON, parseMeaning } from "./schema";
const API = "https://api.groq.com/openai/v1";
export class GroqClient {
  constructor(
    private settings: Settings,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async request(path: string, body?: unknown): Promise<any> {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 45000);
    try {
      const response = await this.fetcher(API + path, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${this.settings.apiKey}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: abort.signal,
        credentials: "omit",
        redirect: "error",
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          throw new AppError(
            "invalid_key",
            "Groq anahtarı geçersiz veya erişim izni yok. Ayarları kontrol edin.",
          );
        if (response.status === 429)
          throw new AppError(
            "rate_limit",
            "Groq kullanım kotası aşıldı. Bir süre bekleyin ve Console limitlerini kontrol edin.",
          );
        if (
          response.status === 400 ||
          response.status === 404 ||
          response.status === 413
        )
          throw new AppError(
            "unsupported_model",
            "Model veya bağlam sınırı bu isteği desteklemiyor. Başka model ya da daha kısa sayfa deneyin.",
          );
        throw new AppError(
          "provider_error",
          "Groq şu anda yanıt veremiyor. Daha sonra yeniden deneyin.",
        );
      }
      try {
        return await response.json();
      } catch {
        throw new AppError(
          "invalid_response",
          "Groq geçerli bir yanıt vermedi.",
        );
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        abort.signal.aborted ? "timeout" : "network",
        abort.signal.aborted
          ? "İstek zaman aşımına uğradı. Yeniden deneyin."
          : "Groq bağlantısı kurulamadı. İnternet bağlantınızı kontrol edin.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  async listModels(): Promise<ModelOption[]> {
    const value = await this.request("/models");
    if (!Array.isArray(value?.data))
      throw new AppError("invalid_response", "Model listesi okunamadı.");
    return value.data
      .filter((m: any) => typeof m?.id === "string" && m.active !== false)
      .map((m: any) => ({ id: m.id }))
      .sort((a: ModelOption, b: ModelOption) => a.id.localeCompare(b.id));
  }
  private async chat(instruction: string, data: unknown): Promise<string> {
    const value = await this.request("/chat/completions", {
      model: this.settings.model,
      messages: [
        { role: "system", content: instruction },
        { role: "user", content: JSON.stringify(data) },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });
    const choice = value?.choices?.[0];
    const content = choice?.message?.content;
    if (
      choice?.finish_reason !== "stop" ||
      typeof content !== "string" ||
      !content.trim()
    )
      throw new AppError(
        "invalid_response",
        "Model açıklamayı tamamlayamadı. Başka model seçin veya yeniden deneyin.",
      );
    return content;
  }
  async verify(): Promise<void> {
    const models = await this.listModels();
    if (!models.some((m) => m.id === this.settings.model))
      throw new AppError(
        "unsupported_model",
        "Seçilen model hesabınızda kullanılabilir değil.",
      );
    const value = parseJSON(
      await this.chat('Return exactly this JSON object: {"ok":true}.', {
        check: true,
      }),
    );
    if (value.ok !== true)
      throw new AppError(
        "unsupported_model",
        "Bu model JSON yanıtı doğrulamasını geçemedi. Başka model seçin.",
      );
  }
  async summarize(text: string): Promise<string> {
    const value = parseJSON(await this.chat(summaryPrompt, { text }));
    if (
      typeof value.summary !== "string" ||
      !value.summary.trim() ||
      value.summary.length > 6000
    )
      throw new AppError(
        "invalid_response",
        "Sayfa özeti okunamadı. Yeniden deneyin.",
      );
    return value.summary;
  }
  async explain(
    page: PageContent,
    summary: string,
    selection: SelectionContext,
  ): Promise<Meaning> {
    return parseMeaning(
      await this.chat(meaningPrompt, { title: page.title, summary, selection }),
    );
  }
}
