import { get, writable } from "svelte/store";
import { browser } from "$app/environment";

export type Theme = "light" | "dark";

const THEME_KEY = "cv-lite.theme";
const defaultTheme: Theme = "light";

export const theme = writable<Theme>(defaultTheme);

const isTheme = (value: string | null): value is Theme => {
  return value === "light" || value === "dark";
};

/**
 * Resolves the initial theme using a stored value and system preference.
 *
 * @param storedTheme - Value read from persistent storage.
 * @param prefersDark - Whether the OS/browser prefers dark mode.
 * @returns The resolved UI theme.
 */
export const resolveThemePreference = (storedTheme: string | null, prefersDark: boolean): Theme => {
  if (isTheme(storedTheme)) {
    return storedTheme;
  }
  return prefersDark ? "dark" : "light";
};

const detectSystemDarkMode = (): boolean => {
  if (!browser) {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

const applyThemeToDocument = (nextTheme: Theme) => {
  if (!browser) {
    return;
  }
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;
};

const readStoredTheme = (): string | null => {
  if (!browser) {
    return null;
  }
  try {
    return localStorage.getItem(THEME_KEY);
  } catch (error) {
    console.error("Unable to read stored theme preference", { error });
    return null;
  }
};

const persistTheme = (nextTheme: Theme) => {
  if (!browser) {
    return;
  }
  try {
    localStorage.setItem(THEME_KEY, nextTheme);
  } catch (error) {
    console.error("Unable to persist theme preference", { nextTheme, error });
  }
};

/**
 * Initializes theme state during client bootstrap.
 *
 * @returns Nothing.
 */
export const initializeTheme = () => {
  const resolvedTheme = resolveThemePreference(readStoredTheme(), detectSystemDarkMode());
  theme.set(resolvedTheme);
  applyThemeToDocument(resolvedTheme);
};

/**
 * Sets and persists the selected theme.
 *
 * @param nextTheme - Theme selected by the user.
 * @returns Nothing.
 */
export const setTheme = (nextTheme: Theme) => {
  theme.set(nextTheme);
  applyThemeToDocument(nextTheme);
  persistTheme(nextTheme);
};

/**
 * Toggles between light and dark themes.
 *
 * @returns Nothing.
 */
export const toggleTheme = () => {
  const nextTheme: Theme = get(theme) === "dark" ? "light" : "dark";
  setTheme(nextTheme);
};
