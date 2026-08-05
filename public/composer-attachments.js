const IMAGE_EXTENSIONS = new Map([
  ["image/avif", "avif"],
  ["image/gif", "gif"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export function clipboardImageFiles(clipboardData) {
  return [...(clipboardData?.items || [])]
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);
}

export function clipboardImageName(type, timestamp = Date.now(), index = 0) {
  const instant = new Date(timestamp);
  const date = instant.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const milliseconds = String(instant.getUTCMilliseconds()).padStart(3, "0");
  const suffix = index > 0 ? `-${index + 1}` : "";
  return `clipboard-${date}-${milliseconds}${suffix}.${IMAGE_EXTENSIONS.get(type) || "image"}`;
}

export function attachmentReference(attachment) {
  const label = attachment.name.replace(/[\[\]]/g, "");
  return `[${label}](${attachment.path.replace(/\\/g, "/")})`;
}

export function messageWithAttachments(text, attachments) {
  const body = text.trim();
  const references = attachments.map(attachmentReference).join("\n");
  return [body, references].filter(Boolean).join("\n");
}
