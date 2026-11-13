import { useEffect } from "react";
export function useViewport() {
  useEffect(() => {
    let frame = 0;
    const update = () => { frame = 0; const viewport = window.visualViewport; document.documentElement.style.setProperty("--app-viewport-height", `${Math.round(viewport?.height || innerHeight)}px`); document.documentElement.style.setProperty("--app-viewport-top", `${Math.round(viewport?.offsetTop || 0)}px`); };
    const schedule = () => { if (frame) cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    window.addEventListener("resize", schedule); window.visualViewport?.addEventListener("resize", schedule); window.visualViewport?.addEventListener("scroll", schedule); schedule();
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("scroll", schedule); document.documentElement.style.removeProperty("--app-viewport-height"); document.documentElement.style.removeProperty("--app-viewport-top"); };
  }, []);
}
