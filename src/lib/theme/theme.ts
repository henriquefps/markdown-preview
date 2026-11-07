import { useSyncExternalStore } from 'react';

// Two independent axes saved in localStorage (guarded: storage can be unavailable):
//  - theme: `system` follows prefers-color-scheme; `light`/`dark` put that class on <html>.
//  - palette: `data-palette="<id>"` on <html> (assets/palettes.css). The default has no attribute.
// Call initTheme() once before the first render (works under a CSP that forbids inline scripts).
// Before the hfps redesign the app saved 'light' | 'dark' | 'sepia' | 'cyberpunk' under the
// 'theme' key; migrateLegacyTheme() maps that once to the new key (sepia -> light,
// cyberpunk -> dark) and removes the old entry.

export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = 'system';
export const THEME_STORAGE_KEY = 'mdpreview.theme';

export const PALETTES = ['olive', 'blue', 'violet', 'rose', 'graphite'] as const;
export type Palette = (typeof PALETTES)[number];
export const DEFAULT_PALETTE: Palette = 'olive';
export const PALETTE_STORAGE_KEY = 'mdpreview.palette';

/** Light-mode primary, approximated in sRGB: swatches in the picker and <meta name="theme-color">. */
export const PALETTE_SWATCHES: Record<Palette, string> = {
  olive: '#5b7a3a',
  blue: '#2f6fb5',
  violet: '#7a55c0',
  rose: '#c0467a',
  graphite: '#52575e',
};

export const isTheme = (v: unknown): v is Theme => THEMES.includes(v as Theme);
export const isPalette = (v: unknown): v is Palette => PALETTES.includes(v as Palette);

function read<T>(key: string, ok: (v: unknown) => v is T, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return ok(saved) ? saved : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The choice then lasts for this page load only.
  }
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  if (theme !== 'system') root.classList.add(theme);
}

function applyPalette(palette: Palette): void {
  const root = document.documentElement;
  if (palette === DEFAULT_PALETTE) root.removeAttribute('data-palette');
  else root.setAttribute('data-palette', palette);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', PALETTE_SWATCHES[palette]);
}

let theme: Theme = DEFAULT_THEME;
let palette: Palette = DEFAULT_PALETTE;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getTheme = () => theme;
export const getPalette = () => palette;

export function setTheme(next: Theme): void {
  theme = next;
  applyTheme(next);
  write(THEME_STORAGE_KEY, next);
  emit();
}

export function setPalette(next: Palette): void {
  palette = next;
  applyPalette(next);
  write(PALETTE_STORAGE_KEY, next);
  emit();
}

const LEGACY_THEME_KEY = 'theme';
const LEGACY_THEME_MAP: Record<string, Theme> = {
  light: 'light',
  dark: 'dark',
  sepia: 'light',
  cyberpunk: 'dark',
};

function migrateLegacyTheme(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (legacy === null) return;
    const mapped = LEGACY_THEME_MAP[legacy];
    if (mapped && localStorage.getItem(THEME_STORAGE_KEY) === null) {
      localStorage.setItem(THEME_STORAGE_KEY, mapped);
    }
    localStorage.removeItem(LEGACY_THEME_KEY);
  } catch {
    // Storage unavailable: nothing to migrate.
  }
}

/** Reads the saved theme and palette and applies them; call once before the first render. */
export function initTheme(): void {
  migrateLegacyTheme();
  theme = read(THEME_STORAGE_KEY, isTheme, DEFAULT_THEME);
  applyTheme(theme);
  palette = read(PALETTE_STORAGE_KEY, isPalette, DEFAULT_PALETTE);
  applyPalette(palette);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useTheme = () => useSyncExternalStore(subscribe, getTheme, getTheme);
export const usePalette = () => useSyncExternalStore(subscribe, getPalette, getPalette);

// Resolved light/dark (System follows prefers-color-scheme). Used by code that cannot read
// CSS tokens directly, such as Mermaid.
const darkQuery = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

export const getResolvedTheme = (): 'light' | 'dark' =>
  theme === 'system' ? (darkQuery()?.matches ? 'dark' : 'light') : theme;

function subscribeResolved(listener: () => void): () => void {
  listeners.add(listener);
  const mq = darkQuery();
  mq?.addEventListener('change', listener);
  return () => {
    listeners.delete(listener);
    mq?.removeEventListener('change', listener);
  };
}

export const useResolvedTheme = () =>
  useSyncExternalStore(subscribeResolved, getResolvedTheme, getResolvedTheme);
