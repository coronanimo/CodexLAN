import { join } from "node:path";

export function attachmentRelativeDirectory(threadId, timestamp = Date.now()) {
  const day = new Date(timestamp).toISOString().slice(0, 10);
  return join(".codexlan", "attachments", threadId, day);
}

export function storedAttachmentName(fileName, identifier) {
  return `${identifier}-${fileName}`;
}
