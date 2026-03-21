import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, Appearance } from 'react-native';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { SafeStorage } from '../../services/storage';

type MockColorScheme = 'light' | 'dark' | null;
type MockAppearanceListener = (preferences: { colorScheme: MockColorScheme }) => void;
type MockAppStateListener = (state: string) => void;

let mockCurrentColorScheme: MockColorScheme = 'light';
let mockAppearanceListener: MockAppearanceListener | null = null;
let mockAppStateListener: MockAppStateListener | null = null;

jest.mock('../../services/storage', () => ({
  SafeStorage: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

const mockedSafeStorage = SafeStorage as jest.Mocked<typeof SafeStorage>;

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

describe('ThemeContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentColorScheme = 'light';
    mockAppearanceListener = null;
    mockAppStateListener = null;
    mockedSafeStorage.get.mockResolvedValue('system');
    mockedSafeStorage.set.mockResolvedValue(undefined);
    jest.spyOn(Appearance, 'getColorScheme').mockImplementation(() => mockCurrentColorScheme);
    jest.spyOn(Appearance, 'addChangeListener').mockImplementation((listener) => {
      mockAppearanceListener = listener as MockAppearanceListener;
      return {
        remove: () => {
          mockAppearanceListener = null;
        },
      };
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_eventType, listener) => {
      mockAppStateListener = listener as MockAppStateListener;
      return {
        remove: () => {
          mockAppStateListener = null;
        },
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('updates system theme when appearance changes', async () => {
    mockCurrentColorScheme = 'dark';

    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => {
      expect(result.current.theme).toBe('system');
      expect(result.current.colorScheme).toBe('dark');
    });

    act(() => {
      mockAppearanceListener?.({ colorScheme: 'light' });
    });

    expect(result.current.colorScheme).toBe('light');
  });

  it('refreshes system theme when app returns to active', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => {
      expect(result.current.colorScheme).toBe('light');
    });

    act(() => {
      mockCurrentColorScheme = 'dark';
      mockAppStateListener?.('active');
    });

    expect(result.current.colorScheme).toBe('dark');
  });

  it('keeps manual theme even when system theme changes', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => {
      expect(result.current.colorScheme).toBe('light');
    });

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.colorScheme).toBe('dark');

    act(() => {
      mockAppearanceListener?.({ colorScheme: 'light' });
      mockCurrentColorScheme = 'light';
      mockAppStateListener?.('active');
    });

    expect(result.current.colorScheme).toBe('dark');
  });

  it('reapplies native system mode when switching back to system', async () => {
    mockCurrentColorScheme = 'dark';
    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => {
      expect(result.current.colorScheme).toBe('dark');
    });

    act(() => {
      result.current.setTheme('light');
    });

    expect(result.current.colorScheme).toBe('light');

    act(() => {
      mockCurrentColorScheme = 'dark';
      result.current.setTheme('system');
    });

    expect(result.current.theme).toBe('system');
    expect(result.current.colorScheme).toBe('dark');
  });
});
