export function formatJsonText(value) {
  const source = String(value ?? "");
  const whole = prettyJson(source);
  if (whole) return { text: whole, isJson: true };

  let changed = false;
  const text = source.replace(/```json[\t ]*\r?\n([\s\S]*?)```/gi, (block, body) => {
    const formatted = prettyJson(body);
    if (!formatted) return block;
    changed = true;
    return `\`\`\`json\n${formatted}\n\`\`\``;
  });
  return { text, isJson: false, formattedJsonBlock: changed };
}

export function plainInlineMarkdown(value) {
  return String(value || "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .trim();
}

function prettyJson(value) {
  const candidate = String(value ?? "").trim();
  if (!candidate || !["{", "["].includes(candidate[0])) return null;
  try {
    const parsed = JSON.parse(candidate);
    if (parsed === null || typeof parsed !== "object") return null;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}
