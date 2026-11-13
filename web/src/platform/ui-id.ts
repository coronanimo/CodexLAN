let sequence = 0;
const page = Date.now().toString(36);

// UI identity is needed on ordinary LAN HTTP, where randomUUID is unavailable.
// These IDs are never used as authentication tokens or server conversation IDs.
export function uiId() {
  const source = globalThis.crypto as Partial<Crypto> | undefined;
  if (typeof source?.getRandomValues === "function") {
    const bytes = source.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `ui-${page}-${++sequence}`;
}
