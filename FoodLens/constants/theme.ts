/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#F8FAFC', // Updated from #fff to match design (Slate-50)
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    
    // Semantic Tokens
    surface: '#FFFFFF',
    textPrimary: '#1E293B', // Slate-800
    textSecondary: '#64748B', // Slate-500
    border: '#E2E8F0', // Slate-200
    primary: '#3B82F6', // Blue-500
    glass: 'rgba(255, 255, 255, 0.7)',
    glassBorder: 'rgba(255, 255, 255, 0.4)',
    shadow: '#3B82F6',
  },
  dark: {
    text: '#ECEDEE',
    background: '#020617', // Slate-950
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    
    // Semantic Tokens
    surface: '#1E293B', // Slate-800
    textPrimary: '#F1F5F9', // Slate-100
    textSecondary: '#94A3B8', // Slate-400
    border: '#334155', // Slate-700
    primary: '#60A5FA', // Blue-400
    glass: 'rgba(30, 41, 59, 0.7)', // Slate-800 with opacity
    glassBorder: 'rgba(255, 255, 255, 0.1)',
    shadow: '#000000',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
});

/**
 * Premium 2026 Design Tokens
 */
export const THEME = {
  glass: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 1,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  card: {
    borderRadius: 32,
    padding: 24,
  },
  textMain: {
    color: '#0F172A', // slate-900
    fontWeight: '700' as '700',
  },
  textSub: {
    color: '#64748B', // slate-500
    fontWeight: '500' as '500',
  },
  shadow: {
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
  }
};
