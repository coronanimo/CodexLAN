import { memo, useMemo } from "react";
import Anser from "anser";

export const AnsiText = memo(function AnsiText({ text }: { text: string }) {
  const parts = useMemo(() => Anser.ansiToJson(text, { remove_empty: true }), [text]);
  if (parts.length > 1000) return <pre>{Anser.ansiToText(text)}</pre>;
  return <pre>{parts.map((part, index) => <span key={index} style={{
    color: part.fg ? `rgb(${part.fg})` : undefined,
    backgroundColor: part.bg ? `rgb(${part.bg})` : undefined,
    fontWeight: part.decorations.includes("bold") ? "bold" : undefined,
    textDecoration: part.decorations.includes("underline") ? "underline" : undefined,
  }}>{part.content}</span>)}</pre>;
});
