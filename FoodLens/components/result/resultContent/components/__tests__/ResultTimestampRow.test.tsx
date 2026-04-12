import React from 'react';
import { render } from '@testing-library/react-native';
import { Colors } from '@/constants/theme';
import ResultTimestampRow from '../ResultTimestampRow';

describe('ResultTimestampRow', () => {
  it('renders localized edit chrome text', () => {
    const { getByText, queryByText } = render(
      <ResultTimestampRow
        formattedTimestamp="2026년 4월 10일 오후 12:23"
        theme={Colors.light}
        onDatePress={jest.fn()}
        t={(key: string, fallback?: string) => {
          if (key === 'result.meta.edit') {
            return '수정';
          }

          return fallback ?? key;
        }}
      />
    );

    expect(getByText('수정')).toBeTruthy();
    expect(queryByText('EDIT')).toBeNull();
  });
});
