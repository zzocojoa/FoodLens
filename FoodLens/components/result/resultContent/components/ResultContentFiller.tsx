import React from 'react';
import { View } from 'react-native';
import { RESULT_CONTENT_FILLER_HEIGHT } from '../constants';

type ResultContentFillerProps = {
  backgroundColor: string;
};

export default function ResultContentFiller({ backgroundColor }: ResultContentFillerProps) {
  return (
    <View
      style={{
        position: 'absolute',
        bottom: -RESULT_CONTENT_FILLER_HEIGHT,
        left: 0,
        right: 0,
        height: RESULT_CONTENT_FILLER_HEIGHT,
        backgroundColor,
      }}
    />
  );
}
