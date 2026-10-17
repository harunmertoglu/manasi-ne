import type { HelperRequest, HelperResponse } from "../src/shared/chatgpt";
import { createNativeMessageDecoder, encodeNativeMessage } from "./framing";
import { OpenAIChatGPTClient } from "./openai";
import { ChatGPTSessionManager } from "./session";
import { HelperError } from "./store";

export interface HelperDependencies {
  sessions: ChatGPTSessionManager;
  openai: OpenAIChatGPTClient;
}

export function createDefaultDependencies(): HelperDependencies {
  const sessions = new ChatGPTSessionManager();
  const openai = new OpenAIChatGPTClient((accountId, forceRefresh) =>
    sessions.getValidAccessToken(accountId, forceRefresh),
  );
  return { sessions, openai };
}

export async function handleHelperRequest(
  raw: unknown,
  deps: HelperDependencies,
): Promise<HelperResponse> {
  const req = raw as Partial<HelperRequest> | null;
  const id = typeof req?.id === "string" ? req.id : "unknown";
  try {
    if (!req || typeof req.type !== "string") {
      throw new HelperError("invalid_response", "Geçersiz yardımcı komutu.");
    }
    switch (req.type) {
      case "HELPER_STATUS":
        return { id, ok: true, value: await deps.sessions.getStatus() };
      case "AUTH_SIGN_IN":
        return {
          id,
          ok: true,
          value: await deps.sessions.signIn(req.accountId),
        };
      case "AUTH_SIGN_OUT":
        return {
          id,
          ok: true,
          value: await deps.sessions.signOut(req.accountId),
        };
      case "MODELS_LIST":
        return {
          id,
          ok: true,
          value: await deps.openai.listModels(req.accountId),
        };
      case "VERIFY_MODEL":
        await deps.openai.verifyModel(req.accountId, req.model ?? "");
        return { id, ok: true, value: { verified: true } };
      case "SUMMARIZE": {
        const summary = await deps.openai.summarize(
          req.accountId,
          req.model ?? "",
          req.text ?? "",
        );
        return { id, ok: true, value: { summary } };
      }
      case "EXPLAIN": {
        if (!req.selection) {
          throw new HelperError("invalid_response", "Seçim verisi eksik.");
        }
        const meaning = await deps.openai.explain(
          req.accountId,
          req.model ?? "",
          req.summary ?? "",
          req.selection,
          req.title ?? "",
        );
        return { id, ok: true, value: meaning };
      }
      default:
        throw new HelperError("invalid_response", "Bilinmeyen yardımcı komutu.");
    }
  } catch (error) {
    if (error instanceof HelperError) {
      return { id, ok: false, code: error.code, message: error.message };
    }
    return {
      id,
      ok: false,
      code: "provider_error",
      message: "Yerel ChatGPT yardımcısı isteği tamamlayamadı.",
    };
  }
}

export function startStdioHost(
  deps: HelperDependencies = createDefaultDependencies(),
): void {
  const writeResponse = (res: HelperResponse) => {
    const encoded = encodeNativeMessage(res);
    process.stdout.write(encoded);
  };
  const decode = createNativeMessageDecoder(
    (msg) => {
      void handleHelperRequest(msg, deps).then(writeResponse);
    },
    (err) => {
      writeResponse({
        id: "unknown",
        ok: false,
        code: "invalid_response",
        message: err.message,
      });
    },
  );
  process.stdin.on("data", (chunk: Buffer) => decode(chunk));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startStdioHost();
}
