import { memo, useMemo } from "react";
import Anser from "anser";

// The original light-theme terminal palette, including indexed ANSI colors.
const colors = ["#24364f", "#b42318", "#18794e", "#8a6100", "#245fc7", "#7b4ea3", "#08788a", "#66758a", "#52647c", "#d13c32", "#229765", "#a87300", "#3978df", "#9b63bc", "#1094a5", "#f7f9fc"];
const names = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];
function color(value: string | null, truecolor: string | null) {
  if (!value) return undefined;
  if (value === "ansi-truecolor") return `rgb(${truecolor})`;
  const name = value.replace(/^ansi-(?:bright-)?/, ""), index = names.indexOf(name);
  if (index >= 0) return colors[index + (value.startsWith("ansi-bright-") ? 8 : 0)];
  const palette = Number(value.replace("ansi-palette-", ""));
  if (!Number.isInteger(palette) || palette < 16 || palette > 255) return undefined;
  if (palette >= 232) { const channel = 8 + (palette - 232) * 10; return `rgb(${channel},${channel},${channel})`; }
  const cube = palette - 16, levels = [0, 95, 135, 175, 215, 255];
  return `rgb(${levels[Math.floor(cube / 36)]},${levels[Math.floor(cube / 6) % 6]},${levels[cube % 6]})`;
}

export const AnsiText = memo(function AnsiText({ text }: { text: string }) {
  const parts = useMemo(() => Anser.ansiToJson(text, { remove_empty: true, use_classes: true }), [text]);
  if (parts.length > 1000) return <pre>{Anser.ansiToText(text)}</pre>;
  return <pre>{parts.map((part, index) => <span key={index} className={part.decorations.map((decoration) => `ansi-${decoration === "strikethrough" ? "strike" : decoration}`).join(" ")} style={{
    color: color(part.fg, part.fg_truecolor),
    backgroundColor: color(part.bg, part.bg_truecolor),
  }}>{part.content}</span>)}</pre>;
});
