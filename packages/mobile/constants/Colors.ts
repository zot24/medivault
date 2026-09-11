/**
 * MediVault Color Palette
 * Matches the "Sanctuary Modern" web design aesthetic
 */

const primary = {
  DEFAULT: '#4a7c59', // Sage green
  light: '#e8f0ea',
  dark: '#3a6347',
};

const secondary = {
  DEFAULT: '#2d6a6a', // Deep teal
  light: '#e0eded',
  dark: '#1f4d4d',
};

export const Colors = {
  light: {
    text: '#1a1a1a',
    textMuted: '#666666',
    textSubtle: '#999999',
    background: '#faf9f7',
    surface: '#f5f4f2',
    surfaceAlt: '#efeee9',
    card: '#ffffff',
    border: '#e5e5e5',
    primary: primary.DEFAULT,
    primaryLight: primary.light,
    secondary: secondary.DEFAULT,
    secondaryLight: secondary.light,
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    icon: '#666666',
    tabIconDefault: '#999999',
    tabIconSelected: primary.DEFAULT,
  },
  dark: {
    text: '#fafafa',
    textMuted: '#a1a1aa',
    textSubtle: '#71717a',
    background: '#0f172a',
    surface: '#1e293b',
    surfaceAlt: '#334155',
    card: '#1e293b',
    border: '#334155',
    primary: '#5a9c6d',
    primaryLight: '#1a3a28',
    secondary: '#3d8a8a',
    secondaryLight: '#1a3d3d',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    icon: '#a1a1aa',
    tabIconDefault: '#71717a',
    tabIconSelected: '#5a9c6d',
  },
};

export type ColorScheme = 'light' | 'dark';
