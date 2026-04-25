import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import SupportContactScreen from '../SupportContactScreen';

jest.mock('expo-router', () => ({
  Stack: {
    Screen: () => null,
  },
  useLocalSearchParams: () => ({
    topic: 'analysis',
    analysisId: 'job_123',
    foodName: 'Ramen',
    source: 'result',
  }),
}));

jest.mock('expo-constants', () => ({
  expoConfig: {
    version: '1.0.0',
  },
  nativeApplicationVersion: '1.0.0',
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colorScheme: 'light',
  }),
}));

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    locale: 'en-US',
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

describe('SupportContactScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the email app with a prefilled support message', async () => {
    const canOpenURLSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

    const { getByPlaceholderText, getByText } = render(<SupportContactScreen />);

    fireEvent.changeText(getByPlaceholderText('Tell us what happened'), 'Support request');
    fireEvent.changeText(
      getByPlaceholderText('Describe what you saw, what you expected, and any error message.'),
      'The scan result looks wrong.',
    );

    fireEvent.press(getByText('Open Mail App'));

    await waitFor(() => {
      expect(canOpenURLSpy).toHaveBeenCalled();
      expect(openURLSpy).toHaveBeenCalledWith(
        expect.stringContaining('mailto:support@foodlens.com'),
      );
      expect(openURLSpy.mock.calls[0][0]).toContain('Analysis%20ID');
      expect(openURLSpy.mock.calls[0][0]).toContain('job_123');
      expect(openURLSpy.mock.calls[0][0]).toContain('Ramen');
    });

    canOpenURLSpy.mockRestore();
    openURLSpy.mockRestore();
  });
});
