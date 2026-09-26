export const COLOR_MODE_COOKIE = 'color-mode';
// Last detected system theme, so the server can render it without a flash
export const SYSTEM_COLOR_MODE_COOKIE = 'system-color-mode';

export type ColorMode = 'light' | 'dark';

export function parseColorMode(value: string | undefined): ColorMode | undefined {
  return value === 'light' || value === 'dark' ? value : undefined;
}
