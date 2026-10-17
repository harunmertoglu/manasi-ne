import {
  CHATGPT_HOST_NAME,
  type HelperErrorCode,
  type HelperExplainPayload,
  type HelperModelListPayload,
  type HelperRequest,
  type HelperResponse,
  type HelperStatusPayload,
  type HelperSummarizePayload,
} from "../shared/chatgpt";
import type { Meaning, ModelOption, SelectionContext } from "../shared/types";

export class ChatGPTBridgeError extends Error {
  constructor(
    public readonly code: HelperErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type NativeMessageSender = (
  hostName: string,
  message: HelperRequest,
) => Promise<unknown>;

function defaultSendNativeMessage(
  hostName: string,
  message: HelperRequest,
): Promise<unknown> {
  if (typeof chrome?.runtime?.sendNativeMessage !== "function") {
    return Promise.reject(new Error("Native messaging unavailable"));
  }
  return chrome.runtime.sendNativeMessage(hostName, message);
}

export class ChatGPTNativeBridge {
  constructor(
    private readonly sendNative: NativeMessageSender = defaultSendNativeMessage,
  ) {}

  async send<T>(
    payload: Omit<HelperRequest, "id"> & Record<string, unknown>,
  ): Promise<T> {
    const id = crypto.randomUUID();
    const request = { ...payload, id } as HelperRequest;
    let raw: unknown;
    try {
      raw = await this.sendNative(CHATGPT_HOST_NAME, request);
    } catch {
      throw new ChatGPTBridgeError(
        "helper_unavailable",
        "Yerel ChatGPT yardımcısı kurulu değil veya çalışmıyor. Ayarlar'daki kurulum adımını uygulayın.",
      );
    }
    const response = raw as HelperResponse<T> | undefined;
    if (!response || typeof response.ok !== "boolean") {
      throw new ChatGPTBridgeError(
        "invalid_response",
        "Yerel ChatGPT yardımcısından geçersiz yanıt alındı.",
      );
    }
    if (!response.ok) {
      throw new ChatGPTBridgeError(response.code, response.message);
    }
    return response.value;
  }

  async status(): Promise<
    { installed: false; reason: string } | HelperStatusPayload
  > {
    try {
      return await this.send<HelperStatusPayload>({ type: "HELPER_STATUS" });
    } catch (error) {
      if (
        error instanceof ChatGPTBridgeError &&
        error.code === "helper_unavailable"
      ) {
        return { installed: false, reason: error.message };
      }
      throw error;
    }
  }

  async signIn(accountId?: string): Promise<HelperStatusPayload> {
    return await this.send<HelperStatusPayload>({
      type: "AUTH_SIGN_IN",
      accountId,
    });
  }

  async signOut(accountId?: string): Promise<HelperStatusPayload> {
    return await this.send<HelperStatusPayload>({
      type: "AUTH_SIGN_OUT",
      accountId,
    });
  }

  async listModels(accountId?: string): Promise<ModelOption[]> {
    return await this.send<HelperModelListPayload>({
      type: "MODELS_LIST",
      accountId,
    });
  }

  async verifyModel(accountId: string, model: string): Promise<void> {
    await this.send<{ verified: boolean }>({
      type: "VERIFY_MODEL",
      accountId,
      model,
    });
  }

  async summarize(
    accountId: string,
    model: string,
    text: string,
  ): Promise<string> {
    const result = await this.send<HelperSummarizePayload>({
      type: "SUMMARIZE",
      accountId,
      model,
      text,
    });
    return result.summary;
  }

  async explain(
    accountId: string,
    model: string,
    title: string,
    summary: string,
    selection: SelectionContext,
  ): Promise<Meaning> {
    return await this.send<HelperExplainPayload>({
      type: "EXPLAIN",
      accountId,
      model,
      title,
      summary,
      selection,
    });
  }
}
