import { readMathBlock, renderMath } from "./math-renderer.js?v=0.6.46-math";

export function renderMarkdownDocument(container, value) {
  const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
  container.replaceChildren();

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([^\s`]*)?.*$/);
    if (fence) {
      const marker = fence[1];
      const body = [];
      index += 1;
      while (index < lines.length && !isFenceClose(lines[index], marker)) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      container.append(codeBlock(body.join("\n"), fence[2]));
      continue;
    }

    const mathBlock = readMathBlock(lines, index);
    if (mathBlock) {
      container.append(renderMath(mathBlock.value, { displayMode: true }));
      index = mathBlock.nextIndex;
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const element = document.createElement(`h${heading[1].length}`);
      appendInline(element, heading[2]);
      container.append(element);
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      container.append(document.createElement("hr"));
      index += 1;
      continue;
    }

    const table = readTable(lines, index);
    if (table) {
      container.append(renderTable(table));
      index = table.nextIndex;
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^\s{0,3}>/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s{0,3}>\s?/, ""));
        index += 1;
      }
      const quote = document.createElement("blockquote");
      renderMarkdownDocument(quote, quoteLines.join("\n"));
      container.append(quote);
      continue;
    }

    const listItem = parseListItem(line);
    if (listItem) {
      const list = document.createElement(listItem.ordered ? "ol" : "ul");
      if (listItem.ordered && listItem.number !== 1) list.start = listItem.number;
      while (index < lines.length) {
        const item = parseListItem(lines[index]);
        if (!item || item.ordered !== listItem.ordered) break;
        const row = document.createElement("li");
        const task = item.text.match(/^\[([ xX])\]\s+(.+)$/);
        if (task) {
          row.className = "markdown-task";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = task[1].toLowerCase() === "x";
          checkbox.disabled = true;
          checkbox.setAttribute("aria-hidden", "true");
          row.append(checkbox);
          appendInline(row, task[2]);
        } else {
          appendInline(row, item.text);
        }
        list.append(row);
        index += 1;
      }
      container.append(list);
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !startsBlock(lines, index)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    if (!paragraph.length) {
      paragraph.push(lines[index]);
      index += 1;
    }
    const element = document.createElement("p");
    appendInline(element, paragraph.join("\n"));
    container.append(element);
  }
}

function startsBlock(lines, index) {
  const line = lines[index] || "";
  return /^\s*(`{3,}|~{3,})/.test(line)
    || /^\s{0,3}#{1,6}\s+/.test(line)
    || /^\s{0,3}>/.test(line)
    || isHorizontalRule(line)
    || Boolean(parseListItem(line))
    || Boolean(readMathBlock(lines, index))
    || Boolean(readTable(lines, index));
}

function isFenceClose(line, marker) {
  const character = marker[0];
  const escaped = character === "`" ? "`" : "~";
  return new RegExp(`^\\s*${escaped}{${marker.length},}\\s*$`).test(line);
}

function isHorizontalRule(line) {
  const compact = String(line).trim().replace(/\s/g, "");
  return compact.length >= 3 && (/^\*+$/.test(compact) || /^-+$/.test(compact) || /^_+$/.test(compact));
}

function parseListItem(line) {
  const match = String(line).match(/^\s{0,6}([-+*]|\d+[.)])\s+(.+)$/);
  if (!match) return null;
  const ordered = /^\d/.test(match[1]);
  return {
    ordered,
    number: ordered ? Number.parseInt(match[1], 10) : null,
    text: match[2],
  };
}

function codeBlock(value, language) {
  const figure = document.createElement("figure");
  figure.className = "markdown-code-block";
  if (language) {
    const label = document.createElement("figcaption");
    label.textContent = language;
    figure.append(label);
  }
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = value;
  pre.append(code);
  figure.append(pre);
  return figure;
}

function readTable(lines, index) {
  if (index + 1 >= lines.length) return null;
  const header = splitTableRow(lines[index]);
  const separators = splitTableRow(lines[index + 1]);
  if (header.length < 2 || separators.length !== header.length || !separators.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))) return null;

  const alignments = separators.map((cell) => {
    const marker = cell.trim();
    if (marker.startsWith(":") && marker.endsWith(":")) return "center";
    if (marker.endsWith(":")) return "right";
    return "left";
  });
  const rows = [];
  let nextIndex = index + 2;
  while (nextIndex < lines.length && lines[nextIndex].trim() && hasUnescapedPipe(lines[nextIndex])) {
    const cells = splitTableRow(lines[nextIndex]).slice(0, header.length);
    while (cells.length < header.length) cells.push("");
    rows.push(cells);
    nextIndex += 1;
  }
  return { header, alignments, rows, nextIndex };
}

function renderTable(table) {
  const scroller = document.createElement("div");
  scroller.className = "markdown-preview-table-wrap";
  const element = document.createElement("table");
  const head = document.createElement("thead");
  const heading = document.createElement("tr");
  table.header.forEach((value, index) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.className = `align-${table.alignments[index]}`;
    appendInline(cell, value);
    heading.append(cell);
  });
  head.append(heading);
  const body = document.createElement("tbody");
  for (const row of table.rows) {
    const tableRow = document.createElement("tr");
    row.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.className = `align-${table.alignments[index]}`;
      appendInline(cell, value);
      tableRow.append(cell);
    });
    body.append(tableRow);
  }
  element.append(head, body);
  scroller.append(element);
  return scroller;
}

function hasUnescapedPipe(line) {
  let escaped = false;
  for (const character of String(line)) {
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      return true;
    }
  }
  return false;
}

function splitTableRow(line) {
  if (!hasUnescapedPipe(line)) return [];
  const source = String(line).trim();
  const cells = [];
  let cell = "";
  let escaped = false;
  for (const character of source) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  if (source.startsWith("|")) cells.shift();
  if (source.endsWith("|")) cells.pop();
  return cells;
}

function appendInline(parent, value, depth = 0) {
  const source = String(value ?? "");
  if (!source || depth > 8) {
    parent.append(document.createTextNode(source));
    return;
  }

  const tokens = [
    { expression: /`([^`\n]+)`/, render: (match) => inlineElement("code", match[1], false, depth) },
    { expression: /(?<!\\)\$\$(?!\s)([^$\n]*?\S)(?<!\\)\$\$/, render: (match) => renderMath(match[1], { displayMode: true }) },
    { expression: /(?<!\\)\$(?![\s$])((?:\\.|[^$\\\n])+?)(?<![\s\\])\$/, render: (match) => renderMath(match[1]) },
    { expression: /(?<!\\)\\\((?!\s)(.+?\S)(?<!\\)\\\)/, render: (match) => renderMath(match[1]) },
    { expression: /!\[([^\]\n]*)\]\(([^)\n]+)\)/, render: (match) => imageReference(match[1], match[2]) },
    { expression: /\[([^\]\n]+)\]\(([^)\n]+)\)/, render: (match) => linkElement(match[1], match[2], depth) },
    { expression: /\*\*([^*\n]+)\*\*/, render: (match) => inlineElement("strong", match[1], true, depth) },
    { expression: /__([^_\n]+)__/, render: (match) => inlineElement("strong", match[1], true, depth) },
    { expression: /~~([^~\n]+)~~/, render: (match) => inlineElement("del", match[1], true, depth) },
    { expression: /\*([^*\n]+)\*/, render: (match) => inlineElement("em", match[1], true, depth) },
    { expression: /_([^_\n]+)_/, render: (match) => inlineElement("em", match[1], true, depth) },
    { expression: /<(https?:\/\/[^>\s]+)>/, render: (match) => linkElement(match[1], match[1], depth) },
  ];

  let cursor = 0;
  while (cursor < source.length) {
    let selected = null;
    for (const token of tokens) {
      const match = token.expression.exec(source.slice(cursor));
      if (!match) continue;
      if (!selected || match.index < selected.match.index) selected = { ...token, match };
    }
    if (!selected) {
      appendPlainText(parent, source.slice(cursor));
      break;
    }
    appendPlainText(parent, source.slice(cursor, cursor + selected.match.index));
    parent.append(selected.render(selected.match));
    cursor += selected.match.index + selected.match[0].length;
  }
}

function appendPlainText(parent, value) {
  const lines = String(value).split("\n");
  lines.forEach((line, index) => {
    if (index) parent.append(document.createTextNode(" "));
    if (line) parent.append(document.createTextNode(line));
  });
}

function inlineElement(tagName, value, parseChildren, depth) {
  const element = document.createElement(tagName);
  if (parseChildren) appendInline(element, value, depth + 1);
  else element.textContent = value;
  return element;
}

function linkElement(label, rawTarget, depth) {
  const target = String(rawTarget).trim().replace(/^<|>$/g, "").split(/\s+["']/)[0];
  if (/^(https?:|mailto:)/i.test(target)) {
    const link = document.createElement("a");
    link.href = target;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    appendInline(link, label, depth + 1);
    return link;
  }
  const local = document.createElement("span");
  local.className = "markdown-local-link";
  local.title = target;
  appendInline(local, label, depth + 1);
  return local;
}

function imageReference(label, target) {
  const element = document.createElement("span");
  element.className = "markdown-image-reference";
  element.title = String(target).trim();
  element.textContent = label ? `图片：${label}` : "图片";
  return element;
}
