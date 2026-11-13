import { localFileTarget, fileNameFromPath } from "../../../shared/content-files.mjs";

// Provider directives stop here; React receives ordinary files and visualizations.
export function contentReferences(value, { omitStandaloneFileLabels = false } = {}) {
  const files = [];
  const visualizations = [];
  const seen = new Set();
  const collect = (target, label) => {
    const path = localFileTarget(target);
    if (!path) return null;
    const key = path.replace(/\\/g, "/").toLowerCase();
    const name = fileNameFromPath(path);
    const file = { path, name, label: String(label || "").trim() || name };
    if (!seen.has(key)) {
      seen.add(key);
      files.push(file);
    }
    return file;
  };
  const protectedCode = protectCode(String(value || ""));
  let text = protectedCode.text;
  text = text.replace(/visualize([^\r\n]+)/g, (match, descriptor, offset, source) => {
    if (escapedAt(source, offset)) return match;
    const visualization = visualizationDescriptor(descriptor);
    if (!visualization) return match;
    visualizations.push(visualization);
    return "";
  });
  text = text.replace(/:codex-file-citation\{([^}\r\n]*)\}/g, (match, attributes, offset, source) => {
    if (escapedAt(source, offset)) return match;
    const path = directiveAttribute(attributes, "path");
    const label = directiveAttribute(attributes, "label") || directiveAttribute(attributes, "name");
    return collect(path, label) ? "" : match;
  });
  text = text.replace(/!?\[([^\]\r\n]{1,160})\]\(\s*<?([^\)\r\n]+?)>?\s*\)/g, (match, label, target, offset, source) => {
    if (escapedAt(source, offset)) return match;
    if (!collect(target, label)) return match;
    const before = source.slice(source.lastIndexOf("\n", offset - 1) + 1, offset);
    const end = source.indexOf("\n", offset + match.length);
    const after = source.slice(offset + match.length, end < 0 ? source.length : end);
    return omitStandaloneFileLabels && !before.trim() && !after.trim() ? "" : label;
  });
  text = text.replace(/<((?:file:\/\/\/|\/?[a-z]:[\\/])[^>\r\n]+)>/gi, (match, target, offset, source) => escapedAt(source, offset) ? match : collect(target, "")?.name || match);
  return { text: protectedCode.restore(text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()), files, visualizations };
}

function escapedAt(text, offset) {
  let slashes = 0;
  while (offset > 0 && text[--offset] === "\\") slashes++;
  return slashes % 2 === 1;
}

function protectCode(text) {
  let prefix = "\uE000code";
  while (text.includes(prefix)) prefix += "x";
  const saved = [], hide = (value) => `${prefix}${saved.push(value) - 1}\uE001`;
  let fence = null, block = "", output = "";
  const prose = (value) => value.replace(/(`+)([\s\S]*?)\1(?!`)/g, hide);
  for (const line of text.split(/(?<=\n)/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(line);
    if (fence) {
      block += line;
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        output += hide(block); block = ""; fence = null;
      }
    } else if (marker) {
      fence = marker[1]; block = line;
    } else output += line;
  }
  if (block) output += hide(block);
  output = prose(output);
  return { text: output, restore: (value) => value.replace(new RegExp(`${prefix}(\\d+)\uE001`, "g"), (_, index) => saved[Number(index)]) };
}

function visualizationDescriptor(value) {
  let descriptor;
  try {
    descriptor = JSON.parse(value);
  } catch {
    descriptor = Object.fromEntries([...String(value).matchAll(/"(path|title|mode)"\s*:\s*"((?:\\.|[^"\\])*)"/g)]
      .map((match) => [match[1], decodedDirectiveString(match[2])]));
  }
  const path = localFileTarget(descriptor?.path);
  if (!path || !/\.html?$/i.test(path)) return null;
  return {
    path,
    name: fileNameFromPath(path),
    title: String(descriptor.title || "交互图表").trim() || "交互图表",
    mode: descriptor.mode === "wide" ? "wide" : "standard",
  };
}

function decodedDirectiveString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return String(value).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

function directiveAttribute(attributes, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"\\r\\n]*)"|'([^'\\r\\n]*)')`).exec(attributes);
  return match?.[1] ?? match?.[2] ?? "";
}


