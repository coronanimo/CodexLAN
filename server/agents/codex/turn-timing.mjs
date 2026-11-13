import { milliseconds } from "./protocol-values.mjs";

function duration(value) {
  if (typeof value.durationMs === "number" && value.durationMs >= 0) return value.durationMs;
  const start = milliseconds(value.startedAt), end = milliseconds(value.completedAt);
  return start !== null && end !== null ? Math.max(0, end - start) : null;
}

export function turnTiming(turn) {
  if (turn.itemsPartial && !turn.commandMetrics) return undefined;
  const totalMs = duration(turn);
  if (totalMs === null) return undefined;
  let commandMs = 0, commandCount = 0, commandUnknownCount = 0;
  const commands = new Map(Object.entries(turn.commandMetrics || {}));
  const items = Array.isArray(turn.items) ? turn.items : turn.items instanceof Map ? turn.items.values() : [];
  for (const item of items) if (item.type === "commandExecution") commands.set(item.id, { ...commands.get(item.id), ...item });
  for (const item of commands.values()) {
    commandCount++; const elapsed = duration(item);
    if (elapsed === null) commandUnknownCount++; else commandMs += elapsed;
  }
  commandMs = Math.min(totalMs, Math.round(commandMs));
  return { totalMs, commandMs, commandCount, commandUnknownCount, providerMs: commandUnknownCount ? null : totalMs - commandMs };
}
