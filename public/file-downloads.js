export function downloadableFiles(value) {
  const files = [];
  const seen = new Set();
  const collect = (target, label) => {
    const path = localFileTarget(target);
    if (!path) return false;
    const key = path.replace(/\\/g, "/").toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      const name = fileNameFromPath(path);
      files.push({ path, name, label: String(label || "").trim() || name });
    }
    return true;
  };
  let text = String(value || "");
  text = text.replace(/\[([^\]\r\n]{1,160})\]\(\s*<?([^\)\r\n]+?)>?\s*\)/g, (match, label, target) => collect(target, label) ? "" : match);
  text = text.replace(/<((?:file:\/\/\/|\/?[a-z]:[\\/])[^>\r\n]+)>/gi, (match, target) => collect(target, "") ? "" : match);
  return { text: text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), files };
}

function localFileTarget(target) {
  let value = String(target || "").trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (/^file:\/\/\/[a-z]:\//i.test(value)) value = value.slice(8);
  if (/^\/[a-z]:[\\/]/i.test(value)) value = value.slice(1);
  if (/^[a-z]:[\\/]/i.test(value)) value = value.replace(/:\d+(?::\d+)?$/, "");
  if (/^[a-z]:[\\/][^\r\n]+$/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("/") || /[?#]/.test(value)) return null;
  if (/^(?:\.\.?[\\/])?[^<>:"|?*\r\n]+(?:[\\/][^<>:"|?*\r\n]+)+$/.test(value)) return value;
  if (/^[^<>:"|?*\\/\r\n]+\.[a-z0-9]{1,12}$/i.test(value)) return value;
  return null;
}

function fileNameFromPath(path) {
  return String(path).split(/[\\/]/).filter(Boolean).pop() || "下载文件";
}
