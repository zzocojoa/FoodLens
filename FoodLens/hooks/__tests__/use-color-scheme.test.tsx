import React from 'react';
import { Pressable, Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { useColorScheme } from '../use-color-scheme';

const mockStorageGet = jest.fn();
const mockStorageSet = jest.fn();

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => 'light',
}));

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    get: (...args: unknown[]) => mockStorageGet(...args),
    set: (...args: unknown[]) => mockStorageSet(...args),
  },
}));

interface ColorSchemeProbeProps {
  onRender: (colorScheme: 'light' | 'dark') => void;
}

const ColorSchemeProbe = React.memo(function ColorSchemeProbe({
  onRender,
}: ColorSchemeProbeProps): React.ReactElement {
  const colorScheme = useColorScheme();
  onRender(colorScheme);

  return <Text>{`scheme: ${colorScheme}`}</Text>;
});

const ThemeStatus = (): React.ReactElement => {
  const { theme } = useTheme();

  return <Text>{`theme: ${theme}`}</Text>;
};

const ThemeSwitch = (): React.ReactElement => {
  const { setTheme } = useTheme();

  return (
    <Pressable accessibilityRole="button" onPress={() => setTheme('system')}>
      <Text>use system theme</Text>
    </Pressable>
  );
};

describe('useColorScheme', () => {
  beforeEach((): void => {
    jest.clearAllMocks();
    mockStorageGet.mockResolvedValue('light');
    mockStorageSet.mockResolvedValue(undefined);
  });

  it('does not rerender a resolved color scheme consumer when only the theme preference changes', async (): Promise<void> => {
    const renderSpy: jest.Mock<void, ['light' | 'dark']> = jest.fn();

    const { getByText } = render(
      <ThemeProvider>
        <ThemeStatus />
        <ColorSchemeProbe onRender={renderSpy} />
        <ThemeSwitch />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(getByText('theme: light')).toBeTruthy();
    });
    await waitFor(() => {
      expect(getByText('scheme: light')).toBeTruthy();
    });
    await waitFor(() => {
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(getByText('use system theme'));

    await waitFor(() => {
      expect(getByText('theme: system')).toBeTruthy();
    });
    expect(getByText('scheme: light')).toBeTruthy();
    expect(renderSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockStorageSet).toHaveBeenCalledWith('@user_theme_preference', 'system');
    });
    expect(mockStorageGet).toHaveBeenCalledWith('@user_theme_preference', null);
  });
});
