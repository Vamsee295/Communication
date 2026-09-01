import { useEffect, useState } from "react";

/**
 * Tracks how much of the layout viewport is covered by the on-screen keyboard
 * (mobile Safari / Android Chrome). Returns a pixel inset that can be applied
 * as bottom padding so sticky composers stay above the keyboard.
 */
export function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : undefined;
    if (!vv) return;

    const update = () => {
      const overlap = window.innerHeight - (vv.height + vv.offsetTop);
      setInset(overlap > 40 ? Math.round(overlap) : 0);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
