const ANSI_PATTERN = /\x1b\[([0-9;]*)m/g;
const CONTROL_PATTERN = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)?)/g;

const COLORS = [
  "#24364f", "#b42318", "#18794e", "#8a6100", "#245fc7", "#7b4ea3", "#08788a", "#66758a",
  "#52647c", "#d13c32", "#229765", "#a87300", "#3978df", "#9b63bc", "#1094a5", "#f7f9fc",
];

export function parseAnsiOutput(value) {
  const text = String(value || "");
  const tokens = [];
  const state = defaultState();
  let cursor = 0;
  let match;
  while ((match = ANSI_PATTERN.exec(text))) {
    appendToken(tokens, text.slice(cursor, match.index).replace(CONTROL_PATTERN, ""), state);
    applyCodes(state, match[1]);
    cursor = ANSI_PATTERN.lastIndex;
  }
  appendToken(tokens, text.slice(cursor).replace(CONTROL_PATTERN, ""), state);
  return tokens;
}

export function renderAnsiOutput(element, value) {
  element.replaceChildren();
  for (const token of parseAnsiOutput(value)) {
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
}

function defaultState() {
  return { foreground: null, background: null, bold: false, dim: false, italic: false, underline: false, strike: false, inverse: false };
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
    if (code === 0) Object.assign(state, defaultState());
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
