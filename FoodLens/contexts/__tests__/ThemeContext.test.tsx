import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { ThemeProvider, useTheme } from '../ThemeContext';

const mockSafeStorageGet = jest.fn();
const mockSafeStorageSet = jest.fn();

jest.mock('../../services/storage', () => ({
  SafeStorage: {
    get: (...args: unknown[]) => mockSafeStorageGet(...args),
    set: (...args: unknown[]) => mockSafeStorageSet(...args),
  },
}));

describe('ThemeContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockSafeStorageGet.mockResolvedValue(null);
    mockSafeStorageSet.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('defers theme persistence until after the theme state updates', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement => (
      <ThemeProvider>{children}</ThemeProvider>
    );

    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => {
      expect(result.current.theme).toBe('system');
    });

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.theme).toBe('dark');
    expect(mockSafeStorageSet).not.toHaveBeenCalled();

    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(mockSafeStorageSet).toHaveBeenCalledTimes(1);
    expect(mockSafeStorageSet).toHaveBeenCalledWith('@user_theme_preference', 'dark');
  });
});
