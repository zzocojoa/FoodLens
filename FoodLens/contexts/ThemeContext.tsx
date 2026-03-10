import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import { SafeStorage } from '../services/storage_Logic';

type ThemeType = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  colorScheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'system',
  setTheme: () => {},
  colorScheme: 'light',
});

const THEME_KEY = '@user_theme_preference';
const SYSTEM_THEME_NIGHT_START_HOUR = 19;
const SYSTEM_THEME_NIGHT_END_HOUR = 7;

const resolveSystemThemeFallback = (): 'light' | 'dark' => {
  const hour = new Date().getHours();
  if (hour >= SYSTEM_THEME_NIGHT_START_HOUR || hour < SYSTEM_THEME_NIGHT_END_HOUR) {
    return 'dark';
  }
  return 'light';
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const [theme, setThemeState] = useState<ThemeType>('system');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Load saved theme
    (async () => {
      try {
        const savedTheme = await SafeStorage.get<ThemeType | null>(THEME_KEY, null);
        if (savedTheme) {
          setThemeState(savedTheme);
        }
      } catch (e) {
        console.error('Failed to load theme preference', e);
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  const setTheme = async (newTheme: ThemeType) => {
    setThemeState(newTheme);
    try {
      await SafeStorage.set(THEME_KEY, newTheme);
    } catch (e) {
      console.error('Failed to save theme preference', e);
    }
  };

  const activeColorScheme = 
    theme === 'system' 
      ? (systemColorScheme ?? resolveSystemThemeFallback()) 
      : theme;

  if (!isReady) {
    return null; // Or a splash screen if needed, but null is usually fine for quick load
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colorScheme: activeColorScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
