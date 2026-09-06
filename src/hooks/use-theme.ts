/**
 * Ghostline Theme System
 * Theme: controls the overall environment (light / dark / system / blue-dim)
 * Accent: controls primary personality colour (blue / red / green / yellow / pink / purple / grey)
 *
 * Both values are stored in localStorage and applied to <html> via data attributes.
 * CSS custom properties are overridden by [data-accent="..."] selectors in styles.css.
 */

import { useEffect, useState, useCallback } from "react";

export type ThemeMode = "light" | "dark" | "system" | "blue-dim";
export type AccentColor = "blue" | "red" | "green" | "yellow" | "pink" | "purple" | "grey";

const THEME_KEY = "gl-theme";
const ACCENT_KEY = "gl-accent";

const DEFAULT_THEME: ThemeMode = "light";
const DEFAULT_ACCENT: AccentColor = "blue";

function readStorage<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  return (localStorage.getItem(key) as T | null) ?? fallback;
}

/** Derive the resolved colour-scheme ("light" or "dark") from the chosen theme mode. */
function resolveScheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "dark" || mode === "blue-dim") return "dark";
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

/** Apply theme + accent to the <html> element. */
function applyTheme(mode: ThemeMode, accent: AccentColor) {
  const html = document.documentElement;

  // Remove old theme data attributes
  html.removeAttribute("data-theme");
  html.classList.remove("dark");

  const scheme = resolveScheme(mode);
  if (scheme === "dark") html.classList.add("dark");
  if (mode === "blue-dim") html.setAttribute("data-theme", "blue-dim");

  // Accent data attribute drives CSS variable overrides
  html.setAttribute("data-accent", accent);
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => readStorage(THEME_KEY, DEFAULT_THEME));
  const [accent, setAccentState] = useState<AccentColor>(() => readStorage(ACCENT_KEY, DEFAULT_ACCENT));

  // Apply on mount + whenever values change
  useEffect(() => {
    applyTheme(theme, accent);
  }, [theme, accent]);

  // Listen for system preference changes when mode === "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system", accent);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, accent]);

  const setTheme = useCallback((mode: ThemeMode) => {
    localStorage.setItem(THEME_KEY, mode);
    setThemeState(mode);
  }, []);

  const setAccent = useCallback((color: AccentColor) => {
    localStorage.setItem(ACCENT_KEY, color);
    setAccentState(color);
  }, []);

  return { theme, accent, setTheme, setAccent };
}
