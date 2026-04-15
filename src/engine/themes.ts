const THEME_KEY = 'irongate_theme';

export const THEMES = ['classic', 'green', 'amber', 'slate'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  classic: 'Classic  (ncurses blue/yellow)',
  green: 'Green    (phosphor CRT)',
  amber: 'Amber    (warm phosphor)',
  slate: 'Slate    (dark modern)',
};

const isTheme = (value: string): value is Theme => (THEMES as readonly string[]).includes(value);

export const applyTheme = (theme: Theme): void => {
  const root = document.documentElement;
  THEMES.forEach(t => { root.classList.remove(`theme-${t}`); });
  if (theme !== 'classic') {
    root.classList.add(`theme-${theme}`);
  }
};

export const saveTheme = (theme: Theme): void => {
  localStorage.setItem(THEME_KEY, theme);
};

export const loadTheme = (): Theme => {
  const stored = localStorage.getItem(THEME_KEY);
  return stored && isTheme(stored) ? stored : 'classic';
};
