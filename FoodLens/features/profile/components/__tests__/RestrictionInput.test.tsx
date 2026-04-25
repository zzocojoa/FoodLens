import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Colors } from '@/constants/theme';
import RestrictionInput from '../RestrictionInput';

const theme = Colors.light;

const translate = (_key: string, fallback?: string): string => fallback || _key;

describe('RestrictionInput', () => {
  it('selects the canonical suggestion value instead of the localized display label', () => {
    const onSelectSuggestion = jest.fn();

    render(
      <RestrictionInput
        theme={theme}
        inputValue="복숭아"
        suggestions={[{ value: 'peach', label: '복숭아' }]}
        t={translate}
        onChangeText={jest.fn()}
        onSubmit={jest.fn()}
        onSelectSuggestion={onSelectSuggestion}
      />
    );

    fireEvent.press(screen.getByText('복숭아'));

    expect(onSelectSuggestion).toHaveBeenCalledWith('peach');
  });
});
