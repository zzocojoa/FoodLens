import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Appearance, ColorSchemeName } from 'react-native';
import { SafeStorage } from '../services/storage';

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

const resolveSystemColorScheme = (colorScheme: ColorSchemeName): 'light' | 'dark' => {
  if (colorScheme === 'dark') {
    return 'dark';
  }
  if (colorScheme === 'light') {
    return 'light';
  }
  return resolveSystemThemeFallback();
};

const readSystemColorScheme = (): 'light' | 'dark' => resolveSystemColorScheme(Appearance.getColorScheme());

const loadSavedTheme = async (): Promise<ThemeType | null> => SafeStorage.get<ThemeType | null>(THEME_KEY, null);

const persistTheme = async (theme: ThemeType): Promise<void> => {
  await SafeStorage.set(THEME_KEY, theme);
};

const applyThemePreference = (theme: ThemeType): 'light' | 'dark' => {
  Appearance.setColorScheme(theme === 'system' ? null : theme);
  return readSystemColorScheme();
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeType>('system');
  const [systemColorScheme, setSystemColorScheme] = useState<'light' | 'dark'>(readSystemColorScheme());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initializeTheme = async (): Promise<void> => {
      try {
        const savedTheme = await loadSavedTheme();
        if (savedTheme) {
          setThemeState(savedTheme);
          setSystemColorScheme(applyThemePreference(savedTheme));
          return;
        }
        setSystemColorScheme(applyThemePreference('system'));
      } catch (e) {
        console.error('Failed to load theme preference', {
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setIsReady(true);
      }
    };

    void initializeTheme();
  }, []);

  useEffect(() => {
    const syncSystemTheme = (): void => {
      setSystemColorScheme(readSystemColorScheme());
    };

    const appearanceSubscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemColorScheme(resolveSystemColorScheme(colorScheme));
    });
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncSystemTheme();
      }
    });

    return () => {
      appearanceSubscription.remove();
      appStateSubscription.remove();
    };
  }, []);

  const setTheme = (newTheme: ThemeType): void => {
    setThemeState(newTheme);
    setSystemColorScheme(applyThemePreference(newTheme));
    void persistTheme(newTheme).catch((e) => {
      console.error('Failed to save theme preference', {
        theme: newTheme,
        error: e instanceof Error ? e.message : String(e),
      });
    });
  };

  const activeColorScheme = theme === 'system' ? systemColorScheme : theme;

  if (!isReady) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colorScheme: activeColorScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
