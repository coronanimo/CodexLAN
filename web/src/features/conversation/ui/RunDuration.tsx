import { useEffect, useState } from "react";
export function formatDuration(milliseconds: number) {
  const value = Math.max(0, Math.round(milliseconds));
  if (value < 1000) return `${value} ms`;
  if (value < 10000) return `${(Math.round(value / 100) / 10).toFixed(1)} 秒`;
  if (value < 60000) return `${Math.round(value / 1000)} 秒`;
  const seconds = Math.floor(value / 1000), minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function RunDuration({ start, end, running, duration }: { start?: number | null; end?: number | null; running: boolean; duration?: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running || start == null) return;
    const timer = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000);
    return () => clearInterval(timer);
  }, [running, start]);
  if (!running && duration !== undefined) return <span>{formatDuration(duration)}</span>;
  if (start == null || !running && end == null) return null;
  const elapsed = Math.max(0, (end ?? now) - start);
  const seconds = Math.floor(elapsed / 1000), minutes = Math.floor(seconds / 60);
  return <span>{running ? `${minutes >= 60 ? `${Math.floor(minutes / 60)}:` : ""}${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : formatDuration(elapsed)}</span>;
}
