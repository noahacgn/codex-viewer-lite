import { writable } from "svelte/store";
import { browser } from "$app/environment";
import { dictionaries, type Locale, SUPPORTED_LOCALES } from "$lib/i18n/dictionaries";

const LOCALE_KEY = "cv-lite.locale";

const defaultLocale: Locale = "en-US";

export const locale = writable<Locale>(defaultLocale);

const isLocale = (value: string | null): value is Locale => {
  return value !== null && SUPPORTED_LOCALES.includes(value as Locale);
};

const detectLocale = (): Locale => {
  if (!browser) {
    return defaultLocale;
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
};

export const initializeLocale = () => {
  if (!browser) {
    return;
  }
  const stored = localStorage.getItem(LOCALE_KEY);
  if (isLocale(stored)) {
    locale.set(stored);
    return;
  }
  const detected = detectLocale();
  locale.set(detected);
  localStorage.setItem(LOCALE_KEY, detected);
};

export const setLocale = (nextLocale: Locale) => {
  locale.set(nextLocale);
  if (browser) {
    localStorage.setItem(LOCALE_KEY, nextLocale);
  }
};

export const t = (key: string, currentLocale: Locale) => {
  return dictionaries[currentLocale][key] ?? key;
};
