import { useEffect, useState } from "react";
export function RunDuration({ start, end, running }: { start?: number | null; end?: number | null; running: boolean }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running || start == null) return;
    const timer = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000);
    return () => clearInterval(timer);
  }, [running, start]);
  if (start == null || !running && end == null) return null;
  return <span> · {Math.max(0, ((end ?? now) - start) / 1000).toFixed(running ? 0 : 1)} 秒</span>;
}
