const COLORS = [
  "#24364f", "#b42318", "#18794e", "#8a6100", "#245fc7", "#7b4ea3", "#08788a", "#66758a",
  "#52647c", "#d13c32", "#229765", "#a87300", "#3978df", "#9b63bc", "#1094a5", "#f7f9fc",
];

export function parseAnsiOutput(value) {
  return parseAnsiOutputChunk(value, createAnsiOutputState());
}

export function createAnsiOutputState() {
  return { style: defaultStyle(), pending: "", renderedLength: 0, truncated: false };
}

export function parseAnsiOutputChunk(value, stream) {
  const text = `${stream.pending}${String(value || "")}`;
  const tokens = [];
  stream.pending = "";
  let cursor = 0;
  while (cursor < text.length) {
    const escape = text.indexOf("\x1b", cursor);
    if (escape < 0) {
      appendToken(tokens, text.slice(cursor), stream.style);
      break;
    }
    appendToken(tokens, text.slice(cursor, escape), stream.style);
    const control = readControlSequence(text, escape);
    if (!control) {
      stream.pending = text.slice(escape);
      break;
    }
    if (control.kind === "sgr") applyCodes(stream.style, control.parameters);
    cursor = control.end;
  }
  return tokens;
}

export function renderAnsiOutput(element, value) {
  element.replaceChildren();
  const stream = createAnsiOutputState();
  appendAnsiOutput(element, value, stream);
  return stream;
}

export function appendAnsiOutput(element, value, stream, maxLength = Infinity) {
  for (const token of parseAnsiOutputChunk(value, stream)) {
    stream.renderedLength += token.text.length;
    if (!hasStyle(token)) {
      element.append(document.createTextNode(token.text));
      continue;
    }
    const span = document.createElement("span");
    span.textContent = token.text;
    if (token.foreground) span.style.color = token.foreground;
    if (token.background) span.style.backgroundColor = token.background;
    span.classList.toggle("ansi-bold", token.bold);
    span.classList.toggle("ansi-dim", token.dim);
    span.classList.toggle("ansi-italic", token.italic);
    span.classList.toggle("ansi-underline", token.underline);
    span.classList.toggle("ansi-strike", token.strike);
    element.append(span);
  }
  const excess = stream.renderedLength - maxLength;
  if (excess > 0) trimRenderedStart(element, stream, excess);
  return stream;
}

function defaultStyle() {
  return { foreground: null, background: null, bold: false, dim: false, italic: false, underline: false, strike: false, inverse: false };
}

function readControlSequence(text, start) {
  if (start + 1 >= text.length) return null;
  const kind = text[start + 1];
  if (kind === "[") {
    for (let index = start + 2; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code < 0x40 || code > 0x7e) continue;
      return {
        kind: text[index] === "m" ? "sgr" : "control",
        parameters: text.slice(start + 2, index),
        end: index + 1,
      };
    }
    return null;
  }
  if (kind === "]") {
    for (let index = start + 2; index < text.length; index += 1) {
      if (text[index] === "\x07") return { kind: "control", end: index + 1 };
      if (text[index] === "\x1b" && text[index + 1] === "\\") return { kind: "control", end: index + 2 };
    }
    return null;
  }
  return { kind: "control", end: start + 2 };
}

function trimRenderedStart(element, stream, amount) {
  let remaining = amount;
  while (remaining > 0 && element.firstChild) {
    const node = element.firstChild;
    const length = node.textContent?.length || 0;
    if (length <= remaining) {
      remaining -= length;
      node.remove();
    } else {
      node.textContent = node.textContent.slice(remaining);
      remaining = 0;
    }
  }
  stream.renderedLength -= amount - remaining;
  stream.truncated = true;
}

function appendToken(tokens, text, state) {
  if (!text) return;
  const foreground = state.inverse ? state.background : state.foreground;
  const background = state.inverse ? state.foreground : state.background;
  tokens.push({ text, foreground, background, bold: state.bold, dim: state.dim, italic: state.italic, underline: state.underline, strike: state.strike });
}

function applyCodes(state, source) {
  const codes = source === "" ? [0] : source.split(";").map((value) => Number(value || 0));
  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index];
    if (code === 0) Object.assign(state, defaultStyle());
    else if (code === 1) state.bold = true;
    else if (code === 2) state.dim = true;
    else if (code === 3) state.italic = true;
    else if (code === 4) state.underline = true;
    else if (code === 7) state.inverse = true;
    else if (code === 9) state.strike = true;
    else if (code === 22) { state.bold = false; state.dim = false; }
    else if (code === 23) state.italic = false;
    else if (code === 24) state.underline = false;
    else if (code === 27) state.inverse = false;
    else if (code === 29) state.strike = false;
    else if (code >= 30 && code <= 37) state.foreground = COLORS[code - 30];
    else if (code >= 90 && code <= 97) state.foreground = COLORS[code - 90 + 8];
    else if (code === 39) state.foreground = null;
    else if (code >= 40 && code <= 47) state.background = COLORS[code - 40];
    else if (code >= 100 && code <= 107) state.background = COLORS[code - 100 + 8];
    else if (code === 49) state.background = null;
    else if ((code === 38 || code === 48) && codes[index + 1] === 5 && Number.isInteger(codes[index + 2])) {
      state[code === 38 ? "foreground" : "background"] = ansi256Color(codes[index + 2]);
      index += 2;
    } else if ((code === 38 || code === 48) && codes[index + 1] === 2 && codes.slice(index + 2, index + 5).every(Number.isFinite)) {
      state[code === 38 ? "foreground" : "background"] = rgbColor(codes[index + 2], codes[index + 3], codes[index + 4]);
      index += 4;
    }
  }
}

function ansi256Color(value) {
  const index = Math.max(0, Math.min(255, value));
  if (index < 16) return COLORS[index];
  if (index >= 232) {
    const channel = 8 + (index - 232) * 10;
    return rgbColor(channel, channel, channel);
  }
  const cube = index - 16;
  const levels = [0, 95, 135, 175, 215, 255];
  return rgbColor(levels[Math.floor(cube / 36)], levels[Math.floor(cube / 6) % 6], levels[cube % 6]);
}

function rgbColor(red, green, blue) {
  return `rgb(${clampByte(red)}, ${clampByte(green)}, ${clampByte(blue)})`;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function hasStyle(token) {
  return Boolean(token.foreground || token.background || token.bold || token.dim || token.italic || token.underline || token.strike);
}
