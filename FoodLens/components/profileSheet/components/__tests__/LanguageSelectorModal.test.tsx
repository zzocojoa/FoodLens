import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Animated } from 'react-native';
import LanguageSelectorModal from '../LanguageSelectorModal';

jest.mock('@/components/HapticFeedback', () => {
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    HapticPressable: ({ children, ...props }: React.ComponentProps<typeof ReactNative.Pressable>) => (
      <ReactNative.Pressable {...props}>{children}</ReactNative.Pressable>
    ),
  };
});

describe('LanguageSelectorModal', () => {
  const options = [
    { code: 'auto', label: 'Auto (Photo/GPS)', flag: '📍' },
    { code: 'en-US', label: 'English', flag: '🇺🇸' },
  ];

  it('selects an option from the sheet without relying on the dismiss backdrop', () => {
    const onSelectLanguage = jest.fn();
    const onClose = jest.fn();

    const { getByText } = render(
      <LanguageSelectorModal
        visible
        title="Traveler Card Language"
        options={options}
        selectedCode={undefined}
        colorScheme="light"
        theme={{
          background: '#FFFFFF',
          surface: '#F8FAFC',
          border: '#E2E8F0',
          textPrimary: '#0F172A',
        }}
        panY={new Animated.Value(0)}
        panHandlers={{}}
        onClose={onClose}
        onSelectLanguage={onSelectLanguage}
      />
    );

    fireEvent.press(getByText('English'));

    expect(onSelectLanguage).toHaveBeenCalledTimes(1);
    expect(onSelectLanguage).toHaveBeenCalledWith('en-US');
    expect(onClose).not.toHaveBeenCalled();
  });
});
