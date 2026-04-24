import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import { SafeStorage } from '../services/storage';

type ThemeType = 'light' | 'dark' | 'system';
type ResolvedColorScheme = 'light' | 'dark';
type ThemeSetter = (theme: ThemeType) => void;

interface ThemePreferenceContextType {
  theme: ThemeType;
  setTheme: ThemeSetter;
}

interface ThemeContextType extends ThemePreferenceContextType {
  colorScheme: ResolvedColorScheme;
}

const noopSetTheme: ThemeSetter = (_theme: ThemeType): void => {};

const ThemePreferenceContext = createContext<ThemePreferenceContextType>({
  theme: 'system',
  setTheme: noopSetTheme,
});
const ThemeColorSchemeContext = createContext<ResolvedColorScheme>('light');

const THEME_KEY = '@user_theme_preference';
const SYSTEM_THEME_NIGHT_START_HOUR = 19;
const SYSTEM_THEME_NIGHT_END_HOUR = 7;

const resolveSystemThemeFallback = (): ResolvedColorScheme => {
  const hour = new Date().getHours();
  if (hour >= SYSTEM_THEME_NIGHT_START_HOUR || hour < SYSTEM_THEME_NIGHT_END_HOUR) {
    return 'dark';
  }
  return 'light';
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const [theme, setThemeState] = useState<ThemeType>('system');
  const [isReady, setIsReady] = useState<boolean>(false);
  const persistThemeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const loadThemePreference = async (): Promise<void> => {
      try {
        const savedTheme = await SafeStorage.get<ThemeType | null>(THEME_KEY, null);
        if (savedTheme) {
          setThemeState(savedTheme);
        }
      } catch (error: unknown) {
        console.error('Failed to load theme preference', error);
      } finally {
        setIsReady(true);
      }
    };

    void loadThemePreference();
  }, []);

  const persistThemePreference = async (newTheme: ThemeType): Promise<void> => {
    try {
      await SafeStorage.set(THEME_KEY, newTheme);
    } catch (error: unknown) {
      console.error('Failed to save theme preference', error);
    }
  };

  const deferThemePreferencePersistence = (newTheme: ThemeType): void => {
    if (persistThemeTimeoutRef.current !== null) {
      clearTimeout(persistThemeTimeoutRef.current);
    }

    persistThemeTimeoutRef.current = setTimeout(() => {
      persistThemeTimeoutRef.current = null;
      void persistThemePreference(newTheme);
    }, 0);
  };

  useEffect(() => {
    return () => {
      if (persistThemeTimeoutRef.current !== null) {
        clearTimeout(persistThemeTimeoutRef.current);
      }
    };
  }, []);

  const setTheme = useCallback((newTheme: ThemeType): void => {
    setThemeState(newTheme);
    deferThemePreferencePersistence(newTheme);
  }, []);

  const themePreferenceValue = useMemo<ThemePreferenceContextType>(
    () => ({
      theme,
      setTheme,
    }),
    [theme, setTheme]
  );

  const activeColorScheme: ResolvedColorScheme =
    theme === 'system'
      ? (systemColorScheme ?? resolveSystemThemeFallback())
      : theme;

  if (!isReady) {
    return null;
  }

  return (
    <ThemePreferenceContext.Provider value={themePreferenceValue}>
      <ThemeColorSchemeContext.Provider value={activeColorScheme}>
        {children}
      </ThemeColorSchemeContext.Provider>
    </ThemePreferenceContext.Provider>
  );
}

export const useResolvedColorScheme = (): ResolvedColorScheme => useContext(ThemeColorSchemeContext);

export const useTheme = (): ThemeContextType => {
  const themePreference = useContext(ThemePreferenceContext);
  const colorScheme = useResolvedColorScheme();

  return {
    ...themePreference,
    colorScheme,
  };
};
