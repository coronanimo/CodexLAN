export function renderMath(value, { displayMode = false } = {}) {
  const source = String(value ?? "").trim();
  const element = document.createElement(displayMode ? "div" : "span");
  element.className = displayMode ? "markdown-math markdown-math-block" : "markdown-math markdown-math-inline";
  if (!source) return element;

  const renderer = globalThis.katex?.render;
  if (typeof renderer !== "function") {
    element.textContent = displayMode ? `$$${source}$$` : `$${source}$`;
    element.classList.add("markdown-math-unavailable");
    return element;
  }

  try {
    renderer(source, element, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      trust: false,
      output: "htmlAndMathml",
    });
  } catch {
    element.textContent = displayMode ? `$$${source}$$` : `$${source}$`;
    element.classList.add("markdown-math-error");
  }
  return element;
}

export function readMathBlock(lines, index) {
  const line = String(lines[index] ?? "").trim();
  const delimiter = line.startsWith("$$") ? "$$" : line.startsWith("\\[") ? "\\[" : null;
  if (!delimiter) return null;
  const closing = delimiter === "$$" ? "$$" : "\\]";

  if (line !== delimiter) {
    if (!line.endsWith(closing) || line.length <= delimiter.length + closing.length) return null;
    return { value: line.slice(delimiter.length, -closing.length).trim(), nextIndex: index + 1 };
  }

  const body = [];
  let nextIndex = index + 1;
  while (nextIndex < lines.length && String(lines[nextIndex]).trim() !== closing) {
    body.push(lines[nextIndex]);
    nextIndex += 1;
  }
  if (nextIndex >= lines.length) return null;
  return { value: body.join("\n").trim(), nextIndex: nextIndex + 1 };
}
