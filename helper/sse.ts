import { HelperError } from "./store";

interface SseEventPayload {
  type?: string;
  delta?: string;
  response?: {
    status?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
}

function extractOutputTextFromCompleted(
  payload: SseEventPayload,
): string | null {
  const output = payload.response?.output;
  if (!Array.isArray(output)) return null;
  const parts: string[] = [];
  for (const item of output) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        parts.push(part.text);
      }
    }
  }
  return parts.length > 0 ? parts.join("") : null;
}

export async function parseResponsesSseStream(
  body: ReadableStream<Uint8Array> | null,
): Promise<string> {
  if (!body) {
    throw new HelperError(
      "invalid_response",
      "OpenAI akış gövdesi bulunamadı.",
    );
  }
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let accumulatedDelta = "";
  let completedText: string | null = null;
  let sawCompleted = false;

  const processBlock = (rawBlock: string) => {
    const lines = rawBlock.split(/\r?\n/);
    let eventName = "";
    const dataLines: string[] = [];
    for (const line of lines) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (dataLines.length === 0) return;
    const rawData = dataLines.join("\n").trim();
    if (!rawData || rawData === "[DONE]") return;

    let parsed: SseEventPayload;
    try {
      parsed = JSON.parse(rawData) as SseEventPayload;
    } catch {
      throw new HelperError(
        "invalid_response",
        "OpenAI akışında bozuk JSON verisi alındı.",
      );
    }
    const type = eventName || parsed.type || "";
    if (type === "response.output_text.delta") {
      if (typeof parsed.delta === "string") {
        accumulatedDelta += parsed.delta;
      }
      return;
    }
    if (type === "response.completed") {
      if (
        parsed.response?.status &&
        parsed.response.status !== "completed"
      ) {
        throw new HelperError(
          "provider_error",
          "OpenAI yanıtı tamamlanamadı.",
        );
      }
      sawCompleted = true;
      completedText = extractOutputTextFromCompleted(parsed);
      return;
    }
    if (type === "response.incomplete") {
      throw new HelperError(
        "invalid_response",
        "OpenAI yanıtı eksik sonlandı (response.incomplete).",
      );
    }
    if (type === "response.failed" || type === "error") {
      throw new HelperError(
        "provider_error",
        "OpenAI yanıt üretirken hata bildirdi.",
      );
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        if (block.trim()) processBlock(block);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      for (const block of buffer.split(/\r?\n\r?\n/)) {
        if (block.trim()) processBlock(block);
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!sawCompleted) {
    throw new HelperError(
      "invalid_response",
      "OpenAI akışı tamamlanmadan kesildi.",
    );
  }
  const finalText = (accumulatedDelta || completedText || "").trim();
  if (!finalText) {
    throw new HelperError(
      "invalid_response",
      "OpenAI boş bir yanıt döndürdü.",
    );
  }
  return finalText;
}
