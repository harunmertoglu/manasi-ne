// @vitest-environment node
import { expect, it } from "vitest";
import { parseResponsesSseStream } from "../helper/sse";

function streamFromChunks(chunks: Array<string | Uint8Array>) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          typeof chunk === "string" ? encoder.encode(chunk) : chunk,
        );
      }
      controller.close();
    },
  });
}

it("reconstructs output text from multi-chunk UTF-8 split deltas and CRLF frames when response.completed arrives", async () => {
  const fullEvent1 =
    'event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"{\\"summary\\":\\"Türkçe ' +
    'ğüşıöç\\"}"}\r\n\r\n';
  const fullEvent2 =
    'event: response.completed\r\ndata: {"type":"response.completed","response":{"status":"completed"}}\r\n\r\n';
  const bytes = new TextEncoder().encode(fullEvent1 + fullEvent2);

  // Split right inside a multi-byte UTF-8 Turkish character sequence
  const split1 = bytes.subarray(0, 96);
  const split2 = bytes.subarray(96);

  const result = await parseResponsesSseStream(
    streamFromChunks([split1, split2]),
  );
  expect(JSON.parse(result)).toEqual({ summary: "Türkçe ğüşıöç" });
});

it("rejects streams that end with response.incomplete, response.failed, or premature EOF without response.completed", async () => {
  const incomplete = streamFromChunks([
    'event: response.output_text.delta\ndata: {"delta":"{\\"summary\\":\\"yarım\\"}"}\n\n',
    'event: response.incomplete\ndata: {"type":"response.incomplete"}\n\n',
  ]);
  await expect(parseResponsesSseStream(incomplete)).rejects.toMatchObject({
    code: "invalid_response",
  });

  const failed = streamFromChunks([
    'event: response.failed\ndata: {"type":"response.failed"}\n\n',
  ]);
  await expect(parseResponsesSseStream(failed)).rejects.toMatchObject({
    code: "provider_error",
  });

  const prematureEof = streamFromChunks([
    'event: response.output_text.delta\ndata: {"delta":"{\\"summary\\":\\"yarım\\"}"}\n\n',
  ]);
  await expect(parseResponsesSseStream(prematureEof)).rejects.toMatchObject({
    code: "invalid_response",
  });
});
