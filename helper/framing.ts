const MAX_MESSAGE_BYTES = 1024 * 1024;

export function encodeNativeMessage(message: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  if (payload.length > MAX_MESSAGE_BYTES) {
    throw new Error("Native message exceeds 1 MiB limit.");
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

export function createNativeMessageDecoder(
  onMessage: (message: unknown) => void,
  onError: (error: Error) => void,
): (chunk: Buffer) => void {
  let buffer = Buffer.alloc(0);
  return (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (length > MAX_MESSAGE_BYTES) {
        buffer = Buffer.alloc(0);
        onError(new Error("Incoming native message exceeds 1 MiB limit."));
        return;
      }
      if (buffer.length < 4 + length) return;
      const raw = buffer.subarray(4, 4 + length).toString("utf8");
      buffer = buffer.subarray(4 + length);
      try {
        onMessage(JSON.parse(raw));
      } catch {
        onError(new Error("Invalid JSON in native message."));
      }
    }
  };
}
