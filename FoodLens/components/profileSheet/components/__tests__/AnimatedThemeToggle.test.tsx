import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AnimatedThemeToggle from '../AnimatedThemeToggle';

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

jest.mock('@/components/HapticFeedback', () => {
  const React = jest.requireActual('react');
  const { Pressable } = jest.requireActual('react-native');
  return {
    HapticPressable: ({ children, ...props }: any) => <Pressable {...props}>{children}</Pressable>,
  };
});

const theme = {
  surface: '#111111',
  border: '#222222',
  textPrimary: '#ffffff',
  textSecondary: '#999999',
};

describe('AnimatedThemeToggle', () => {
  it('routes system tab presses to setTheme and keeps highlight non-interactive', () => {
    const setTheme = jest.fn();
    const { getByTestId } = render(
      <AnimatedThemeToggle
        theme={theme}
        currentTheme="dark"
        setTheme={setTheme}
        colorScheme="dark"
      />
    );

    fireEvent(getByTestId('theme-toggle-container'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 56 } },
    });

    fireEvent.press(getByTestId('theme-toggle-option-system'));

    expect(setTheme).toHaveBeenCalledWith('system');
    expect(getByTestId('theme-toggle-highlight').props.pointerEvents).toBe('none');
  });
});
