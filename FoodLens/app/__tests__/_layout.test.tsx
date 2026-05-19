import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import type { AppStateEvent, AppStateStatus } from 'react-native';
import { AppState, Linking, Platform } from 'react-native';

const mockRouterReplace = jest.fn();
const mockRouterBack = jest.fn();
const mockRouterCanGoBack = jest.fn();
const mockUsePathname = jest.fn();
const mockUseGlobalSearchParams = jest.fn();
const mockPreventAutoHideAsync = jest.fn();
const mockHideAsync = jest.fn();
const mockInitializeSafeStorage = jest.fn();
const mockCleanupOrphanedImages = jest.fn();
const mockClearSession = jest.fn();
const mockRestoreSession = jest.fn();
const mockGetCurrentUserIdSnapshot = jest.fn();
const mockStartPhase2SyncRuntime = jest.fn();
const mockHasCompletedOnboarding = jest.fn();
const mockSyncI18nSettingsFromProfile = jest.fn();
const mockSyncHistoryFromCloud = jest.fn();
const mockSyncProfileFromCloud = jest.fn();
const mockSyncReleasePresentationStateVersion = jest.fn();
const mockUseColorScheme = jest.fn();
const mockInitSentry = jest.fn();
const mockSetUser = jest.fn();
const mockShouldUseAndroidExitFlow = jest.fn();
const mockShouldExitOnSecondBack = jest.fn();

type MockStackScreenOptions = {
  animation?: string;
  contentStyle?: {
    backgroundColor: string;
  };
  gestureEnabled?: boolean;
};

type MockStackScreenProps = {
  name: string;
  options?: MockStackScreenOptions;
};

const mockAppStateListeners = new Set<(nextState: AppStateStatus) => void>();
const mockStackScreenProps: MockStackScreenProps[] = [];

const emitAppStateChange = (nextState: AppStateStatus): void => {
  mockAppStateListeners.forEach((listener) => {
    listener(nextState);
  });
};

jest.mock('react-native-reanimated', () => ({}));

jest.mock('react-native-gesture-handler', () => {
  const ReactModule = jest.requireActual('react') as typeof import('react');
  return {
    GestureHandlerRootView: function MockGestureHandlerRootView({
      children,
    }: {
      children: React.ReactNode;
    }) {
      return ReactModule.createElement(ReactModule.Fragment, null, children);
    },
  };
});

jest.mock('@react-navigation/native', () => {
  const ReactModule = jest.requireActual('react') as typeof import('react');
  return {
    DarkTheme: {},
    DefaultTheme: {},
    ThemeProvider: function MockThemeProvider({ children }: { children: React.ReactNode }) {
      return ReactModule.createElement(ReactModule.Fragment, null, children);
    },
  };
});

jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual('react') as typeof import('react');
  const Stack = function MockStack({ children }: { children: React.ReactNode }) {
    return ReactModule.createElement(ReactModule.Fragment, null, children);
  };
  Stack.Screen = function MockStackScreen(props: MockStackScreenProps) {
    mockStackScreenProps.push(props);
    return null;
  };

  return {
    Stack,
    router: {
      replace: (...args: unknown[]) => mockRouterReplace(...args),
      back: (...args: unknown[]) => mockRouterBack(...args),
      canGoBack: (...args: unknown[]) => mockRouterCanGoBack(...args),
    },
    usePathname: (...args: unknown[]) => mockUsePathname(...args),
    useGlobalSearchParams: (...args: unknown[]) => mockUseGlobalSearchParams(...args),
  };
});

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: (...args: unknown[]) => mockPreventAutoHideAsync(...args),
  hideAsync: (...args: unknown[]) => mockHideAsync(...args),
}));

jest.mock('@tanstack/react-query', () => {
  const ReactModule = jest.requireActual('react') as typeof import('react');
  return {
    QueryClientProvider: function MockQueryClientProvider({
      children,
    }: {
      children: React.ReactNode;
    }) {
      return ReactModule.createElement(ReactModule.Fragment, null, children);
    },
  };
});

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual('react') as typeof import('react');
  return {
    SafeAreaProvider: function MockSafeAreaProvider({ children }: { children: React.ReactNode }) {
      return ReactModule.createElement(ReactModule.Fragment, null, children);
    },
    initialWindowMetrics: null,
  };
});

jest.mock('../../services/queryClient', () => ({
  queryClient: {},
}));

jest.mock('../../services/storage', () => ({
  SafeStorage: {
    get: jest.fn(),
    set: jest.fn(),
  },
  initializeSafeStorage: (...args: unknown[]) => mockInitializeSafeStorage(...args),
}));

jest.mock('../../services/imageStorage', () => ({
  cleanupOrphanedImages: (...args: unknown[]) => mockCleanupOrphanedImages(...args),
}));

jest.mock('../../services/auth/sessionManager', () => ({
  clearSession: (...args: unknown[]) => mockClearSession(...args),
  restoreSession: (...args: unknown[]) => mockRestoreSession(...args),
}));

jest.mock('../../services/auth/currentUser', () => ({
  getCurrentUserIdSnapshot: (...args: unknown[]) => mockGetCurrentUserIdSnapshot(...args),
}));

jest.mock('../../services/sync/phase2SyncQueue', () => ({
  startPhase2SyncRuntime: (...args: unknown[]) => mockStartPhase2SyncRuntime(...args),
}));

jest.mock('../../services/onboardingGateService', () => ({
  hasCompletedOnboarding: (...args: unknown[]) => mockHasCompletedOnboarding(...args),
}));

jest.mock('../../features/i18n/services/i18nStore', () => ({
  syncI18nSettingsFromProfile: (...args: unknown[]) =>
    mockSyncI18nSettingsFromProfile(...args),
}));

jest.mock('../../services/analysisService', () => ({
  AnalysisService: {
    syncHistoryFromCloud: (...args: unknown[]) => mockSyncHistoryFromCloud(...args),
  },
}));

jest.mock('../../services/userService', () => ({
  UserService: {
    syncProfileFromCloud: (...args: unknown[]) => mockSyncProfileFromCloud(...args),
  },
}));

jest.mock('../../services/appVersionState', () => ({
  syncReleasePresentationStateVersion: (...args: unknown[]) =>
    mockSyncReleasePresentationStateVersion(...args),
}));

jest.mock('../../contexts/ThemeContext', () => {
  const ReactModule = jest.requireActual('react') as typeof import('react');
  return {
    ThemeProvider: function MockAppThemeProvider({ children }: { children: React.ReactNode }) {
      return ReactModule.createElement(ReactModule.Fragment, null, children);
    },
  };
});

jest.mock('../../hooks/use-color-scheme', () => ({
  useColorScheme: (...args: unknown[]) => mockUseColorScheme(...args),
}));

jest.mock('../../components/ErrorBoundary', () => {
  const ReactModule = jest.requireActual('react') as typeof import('react');
  return {
    ErrorBoundary: function MockErrorBoundary({ children }: { children: React.ReactNode }) {
      return ReactModule.createElement(ReactModule.Fragment, null, children);
    },
  };
});

jest.mock('../../services/sentry', () => ({
  initSentry: (...args: unknown[]) => mockInitSentry(...args),
  setUser: (...args: unknown[]) => mockSetUser(...args),
}));

jest.mock('../../components/navigation/androidTopLevelNavigation', () => ({
  shouldUseAndroidExitFlow: (...args: unknown[]) => mockShouldUseAndroidExitFlow(...args),
  shouldExitOnSecondBack: (...args: unknown[]) => mockShouldExitOnSecondBack(...args),
}));

jest.mock('../../features/i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

const loadLayoutModule = (): typeof import('../_layout') => {
  return jest.requireActual('../_layout') as typeof import('../_layout');
};

describe('RootLayout polling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockAppStateListeners.clear();
    mockStackScreenProps.length = 0;
    jest.replaceProperty(Platform, 'OS', 'ios');
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      (_event: AppStateEvent, listener: (nextState: AppStateStatus) => void) => {
        mockAppStateListeners.add(listener);
        return {
          remove: () => {
            mockAppStateListeners.delete(listener);
          },
        };
      }
    );
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    mockRouterCanGoBack.mockReturnValue(false);
    mockUsePathname.mockReturnValue('/(tabs)');
    mockUseGlobalSearchParams.mockReturnValue({});
    mockPreventAutoHideAsync.mockResolvedValue(undefined);
    mockHideAsync.mockResolvedValue(undefined);
    mockInitializeSafeStorage.mockResolvedValue(undefined);
    mockCleanupOrphanedImages.mockResolvedValue(undefined);
    mockClearSession.mockResolvedValue(undefined);
    mockRestoreSession.mockResolvedValue({
      user: {
        id: 'usr_layout',
      },
    });
    mockGetCurrentUserIdSnapshot.mockReturnValue('usr_layout');
    mockHasCompletedOnboarding.mockResolvedValue(true);
    mockSyncI18nSettingsFromProfile.mockResolvedValue(undefined);
    mockSyncHistoryFromCloud.mockResolvedValue(undefined);
    mockSyncProfileFromCloud.mockResolvedValue(null);
    mockSyncReleasePresentationStateVersion.mockResolvedValue(undefined);
    mockUseColorScheme.mockReturnValue('light');
    mockShouldUseAndroidExitFlow.mockReturnValue(false);
    mockShouldExitOnSecondBack.mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('disables native swipe-back on the tabs root screen', () => {
    const { default: RootLayout } = loadLayoutModule();
    render(<RootLayout />);

    expect(
      mockStackScreenProps.find((screenProps) => screenProps.name === '(tabs)')?.options,
    ).toEqual(expect.objectContaining({ gestureEnabled: false }));
  });

  it('defers root startup polling until after the startup delay', async () => {
    const { default: RootLayout, PROFILE_SYNC_STARTUP_DELAY_MS } = loadLayoutModule();
    render(<RootLayout />);

    expect(mockSyncI18nSettingsFromProfile).not.toHaveBeenCalledWith({ pullFromServer: true });
    expect(mockSyncHistoryFromCloud).not.toHaveBeenCalledWith('usr_layout', { force: false });
    expect(mockSyncProfileFromCloud).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(PROFILE_SYNC_STARTUP_DELAY_MS - 1);
    });

    expect(mockSyncI18nSettingsFromProfile).not.toHaveBeenCalledWith({ pullFromServer: true });
    expect(mockSyncHistoryFromCloud).not.toHaveBeenCalledWith('usr_layout', { force: false });
    expect(mockSyncProfileFromCloud).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockSyncI18nSettingsFromProfile).toHaveBeenCalledWith({ pullFromServer: true });
    });

    await waitFor(() => {
      expect(mockSyncHistoryFromCloud).toHaveBeenCalledWith('usr_layout', { force: false });
    });

    await waitFor(() => {
      expect(mockSyncProfileFromCloud).toHaveBeenCalledWith('usr_layout', { force: false });
    });
  });

  it('does not let app-active events bypass the startup delay', async () => {
    const { default: RootLayout, PROFILE_SYNC_STARTUP_DELAY_MS } = loadLayoutModule();
    render(<RootLayout />);

    await waitFor(() => {
      expect(mockAppStateListeners.size).toBe(3);
    });

    act(() => {
      jest.advanceTimersByTime(1_000);
      emitAppStateChange('active');
    });

    expect(mockSyncI18nSettingsFromProfile).not.toHaveBeenCalledWith({ pullFromServer: true });
    expect(mockSyncHistoryFromCloud).not.toHaveBeenCalled();
    expect(mockSyncProfileFromCloud).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(PROFILE_SYNC_STARTUP_DELAY_MS - 1_001);
    });

    expect(mockSyncProfileFromCloud).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockSyncProfileFromCloud).toHaveBeenCalledTimes(1);
    });
    expect(mockSyncHistoryFromCloud).toHaveBeenCalledTimes(1);
    expect(
      mockSyncI18nSettingsFromProfile.mock.calls.filter(
        ([args]) => args && (args as { pullFromServer?: boolean }).pullFromServer === true,
      ),
    ).toHaveLength(1);
  });

  it('runs history cloud sync when the app returns active after startup', async () => {
    const { default: RootLayout, PROFILE_SYNC_STARTUP_DELAY_MS } = loadLayoutModule();
    render(<RootLayout />);

    await act(async () => {
      jest.advanceTimersByTime(PROFILE_SYNC_STARTUP_DELAY_MS);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(mockSyncHistoryFromCloud).toHaveBeenCalledTimes(1);
    });
    mockSyncHistoryFromCloud.mockClear();

    await act(async () => {
      jest.advanceTimersByTime(PROFILE_SYNC_STARTUP_DELAY_MS);
      emitAppStateChange('active');
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockSyncHistoryFromCloud).toHaveBeenCalledWith('usr_layout', { force: false });
    });
  });

  it('does not replace route or sync profile data for enabled onboarding preview deep links', async () => {
    process.env['EXPO_PUBLIC_ONBOARDING_PREVIEW_ENABLED'] = '1';
    mockUsePathname.mockReturnValue('/onboarding');
    mockUseGlobalSearchParams.mockReturnValue({ preview: '1' });

    const { default: RootLayout, PROFILE_SYNC_STARTUP_DELAY_MS } = loadLayoutModule();
    render(<RootLayout />);

    await waitFor(() => {
      expect(mockHideAsync).toHaveBeenCalledTimes(1);
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockRestoreSession).not.toHaveBeenCalled();
    expect(mockHasCompletedOnboarding).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(PROFILE_SYNC_STARTUP_DELAY_MS);
      await Promise.resolve();
    });

    expect(mockSyncI18nSettingsFromProfile).not.toHaveBeenCalled();
    expect(mockSyncHistoryFromCloud).not.toHaveBeenCalled();
    expect(mockSyncProfileFromCloud).not.toHaveBeenCalled();

    delete process.env['EXPO_PUBLIC_ONBOARDING_PREVIEW_ENABLED'];
  });

  it('routes to preview when the enabled onboarding preview arrives as the initial URL', async () => {
    process.env['EXPO_PUBLIC_ONBOARDING_PREVIEW_ENABLED'] = '1';
    mockUsePathname.mockReturnValue('/');
    mockUseGlobalSearchParams.mockReturnValue({});
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('foodlens:///onboarding?preview=1');

    const { default: RootLayout, PROFILE_SYNC_STARTUP_DELAY_MS } = loadLayoutModule();
    render(<RootLayout />);

    await waitFor(() => {
      expect(mockHideAsync).toHaveBeenCalledTimes(1);
    });

    expect(mockRouterReplace).toHaveBeenCalledWith('/onboarding?preview=1');
    expect(mockRestoreSession).not.toHaveBeenCalled();
    expect(mockHasCompletedOnboarding).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(PROFILE_SYNC_STARTUP_DELAY_MS);
      await Promise.resolve();
    });

    expect(mockSyncI18nSettingsFromProfile).not.toHaveBeenCalled();
    expect(mockSyncHistoryFromCloud).not.toHaveBeenCalled();
    expect(mockSyncProfileFromCloud).not.toHaveBeenCalled();

    delete process.env['EXPO_PUBLIC_ONBOARDING_PREVIEW_ENABLED'];
  });

  it('does not reprocess the initial preview URL after leaving preview mode', async () => {
    process.env['EXPO_PUBLIC_ONBOARDING_PREVIEW_ENABLED'] = '1';
    mockUsePathname.mockReturnValue('/');
    mockUseGlobalSearchParams.mockReturnValue({});
    const initialUrlSpy = jest
      .spyOn(Linking, 'getInitialURL')
      .mockResolvedValue('foodlens:///onboarding?preview=1');

    const { default: RootLayout } = loadLayoutModule();
    const view = render(<RootLayout />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/onboarding?preview=1');
    });

    mockRouterReplace.mockClear();
    mockRestoreSession.mockClear();
    mockUsePathname.mockReturnValue('/onboarding');
    mockUseGlobalSearchParams.mockReturnValue({ preview: '1' });
    view.rerender(<RootLayout />);

    await act(async () => {
      await Promise.resolve();
    });

    mockUsePathname.mockReturnValue('/');
    mockUseGlobalSearchParams.mockReturnValue({});
    view.rerender(<RootLayout />);

    await waitFor(() => {
      expect(mockRestoreSession).toHaveBeenCalledTimes(1);
    });

    expect(initialUrlSpy).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).not.toHaveBeenCalledWith('/onboarding?preview=1');

    delete process.env['EXPO_PUBLIC_ONBOARDING_PREVIEW_ENABLED'];
  });
});
