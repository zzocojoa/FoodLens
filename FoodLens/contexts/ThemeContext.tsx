import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Appearance, ColorSchemeName, Platform } from 'react-native';
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

const readDeviceColorScheme = (): 'light' | 'dark' => resolveSystemColorScheme(Appearance.getColorScheme());

const applyThemePreference = (theme: ThemeType): 'light' | 'dark' => {
  try {
    if (Platform.OS !== 'web') {
      Appearance.setColorScheme(theme === 'system' ? null : theme);
    }
  } catch (e) {
    // catch any unsupported API errors safely
  }
  return readDeviceColorScheme();
};

const loadSavedTheme = async (): Promise<ThemeType | null> => SafeStorage.get<ThemeType | null>(THEME_KEY, null);

const persistTheme = async (theme: ThemeType): Promise<void> => {
  await SafeStorage.set(THEME_KEY, theme);
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeType>('system');
  const [deviceColorScheme, setDeviceColorScheme] = useState<'light' | 'dark'>(readDeviceColorScheme());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initializeTheme = async (): Promise<void> => {
      try {
        const savedTheme = await loadSavedTheme();
        if (savedTheme) {
          setThemeState(savedTheme);
          setDeviceColorScheme(applyThemePreference(savedTheme));
          return;
        }
        setDeviceColorScheme(applyThemePreference('system'));
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
    const syncDeviceTheme = (): void => {
      setDeviceColorScheme(readDeviceColorScheme());
    };

    const appearanceSubscription = Appearance.addChangeListener(({ colorScheme }) => {
      setDeviceColorScheme(resolveSystemColorScheme(colorScheme));
    });
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncDeviceTheme();
      }
    });

    return () => {
      appearanceSubscription.remove();
      appStateSubscription.remove();
    };
  }, []);

  const setTheme = (newTheme: ThemeType): void => {
    setThemeState(newTheme);
    setDeviceColorScheme(applyThemePreference(newTheme));

    // 안드로이드 브릿지 비동기 딜레이(지연) 완벽 해결을 위한 Polling
    if (newTheme === 'system' && Platform.OS === 'android') {
      const checkAndSync = () => setDeviceColorScheme(readDeviceColorScheme());
      setTimeout(checkAndSync, 50);
      setTimeout(checkAndSync, 150);
      setTimeout(checkAndSync, 300); // 확실한 동기화를 위해 다중 마이크로 폴링
    }

    void persistTheme(newTheme).catch((e) => {
      console.error('Failed to save theme preference', {
        theme: newTheme,
        error: e instanceof Error ? e.message : String(e),
      });
    });
  };

  const activeColorScheme = theme === 'system' ? deviceColorScheme : theme;

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
