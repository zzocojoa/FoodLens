import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import SupportFaqScreen from '../SupportFaqScreen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  Stack: {
    Screen: () => null,
  },
  useRouter: () => ({
    push: mockPush,
  }),
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

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

describe('SupportFaqScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('expands a question and navigates to contact support', () => {
    const { getByText } = render(<SupportFaqScreen />);

    fireEvent.press(getByText('How do I sign in?'));
    expect(getByText('Use Google, Kakao, or email login. If you forgot your password, use the reset link on the login screen.')).toBeTruthy();

    fireEvent.press(getByText('Contact Support'));
    expect(mockPush).toHaveBeenCalledWith('/help/contact');
  });
});
