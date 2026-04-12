import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Colors } from '@/constants/theme';
import ResultTimestampRow from '../ResultTimestampRow';

describe('ResultTimestampRow', () => {
  it('keeps the timestamp row tappable without rendering the edit pill', () => {
    const onDatePress = jest.fn();
    const { getByText, queryByText } = render(
      <ResultTimestampRow
        formattedTimestamp="2026년 4월 10일 오후 12:23"
        theme={Colors.light}
        onDatePress={onDatePress}
      />
    );

    fireEvent.press(getByText('2026년 4월 10일 오후 12:23'));

    expect(onDatePress).toHaveBeenCalledTimes(1);
    expect(queryByText('수정')).toBeNull();
    expect(queryByText('Edit')).toBeNull();
  });
});
