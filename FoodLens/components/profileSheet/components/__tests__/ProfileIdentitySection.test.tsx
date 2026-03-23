import React from 'react';
import { Keyboard, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import ProfileIdentitySection from '../ProfileIdentitySection';

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

jest.mock('@/components/HapticFeedback', () => {
  const React = jest.requireActual('react');
  const { Pressable, TouchableOpacity } = jest.requireActual('react-native');
  return {
    HapticPressable: ({ children, ...props }: any) => <Pressable {...props}>{children}</Pressable>,
    HapticTouchableOpacity: ({ children, ...props }: any) => (
      <TouchableOpacity {...props}>{children}</TouchableOpacity>
    ),
  };
});

const theme = {
  surface: '#111111',
  border: '#222222',
  textPrimary: '#ffffff',
  textSecondary: '#999999',
  background: '#000000',
  primary: '#2563eb',
};

describe('ProfileIdentitySection', () => {
  it('clears the display name immediately without restoring chrome sizing', () => {
    const onClearName = jest.fn();
    const keyboardDismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});

    const { getByTestId } = render(
      <ProfileIdentitySection
        theme={theme}
        colorScheme="dark"
        name="Tester"
        image={undefined}
        avatars={[]}
        onChangeName={jest.fn()}
        onClearName={onClearName}
        onPickCamera={jest.fn()}
        onPickLibrary={jest.fn()}
        onSelectPreset={jest.fn()}
      />
    );

    fireEvent.press(getByTestId('display-name-clear-button'));

    const style = StyleSheet.flatten(getByTestId('display-name-clear-button').props.style);

    expect(keyboardDismissSpy).toHaveBeenCalledTimes(1);
    expect(onClearName).toHaveBeenCalledTimes(1);
    expect(style.width).toBeUndefined();
    expect(style.height).toBeUndefined();
    expect(style.elevation).toBeUndefined();
  });
});
