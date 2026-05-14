import React from 'react';
import { render } from '@testing-library/react-native';

import { SecureImage } from '../SecureImage';

type CapturedExpoImageProps = {
  source?: unknown;
  recyclingKey?: string | null;
};

type CapturedImageSource = {
  uri?: string;
  cacheKey?: string;
  headers?: Record<string, string>;
};

const mockExpoImage = jest.fn((_props: unknown) => {
  const ReactModule = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');

  return ReactModule.createElement(View, { testID: 'secure-image-expo-image' });
});

jest.mock('expo-image', () => ({
  Image: (props: unknown) => mockExpoImage(props),
}));

const getLatestExpoImageProps = (): CapturedExpoImageProps => {
  const latestCallIndex = mockExpoImage.mock.calls.length - 1;
  const props = mockExpoImage.mock.calls[latestCallIndex]?.[0];

  if (!props || typeof props !== 'object') {
    throw new Error('ExpoImage props were not captured');
  }

  return props as CapturedExpoImageProps;
};

const expectCapturedSourceObject = (source: unknown): CapturedImageSource => {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('ExpoImage source object was not captured');
  }

  return source as CapturedImageSource;
};

describe('SecureImage', () => {
  beforeEach(() => {
    mockExpoImage.mockClear();
  });

  it('changes signed render cache identity when the query signature changes', () => {
    const firstUri = 'https://api.foodlens.test/media/render/asset-1?exp=100&sig=first';
    const secondUri = 'https://api.foodlens.test/media/render/asset-1?exp=200&sig=second';

    const view = render(<SecureImage source={firstUri} />);

    const firstProps = getLatestExpoImageProps();
    const firstSource = expectCapturedSourceObject(firstProps.source);

    expect(firstSource).toEqual({ uri: firstUri, cacheKey: firstUri });
    expect(firstProps.recyclingKey).toBe(firstUri);

    view.rerender(<SecureImage source={secondUri} />);

    const secondProps = getLatestExpoImageProps();
    const secondSource = expectCapturedSourceObject(secondProps.source);

    expect(secondSource).toEqual({ uri: secondUri, cacheKey: secondUri });
    expect(secondSource.cacheKey).not.toBe(firstSource.cacheKey);
    expect(secondProps.recyclingKey).toBe(secondUri);
  });

  it('keeps ordinary remote URI sources on the default cache identity', () => {
    const uri = 'https://cdn.foodlens.test/profile/avatar.jpg?version=1';

    render(<SecureImage source={uri} />);

    const props = getLatestExpoImageProps();
    const source = expectCapturedSourceObject(props.source);

    expect(source).toEqual({ uri });
    expect(source.cacheKey).toBeUndefined();
    expect(props.recyclingKey).toBeUndefined();
  });

  it('preserves ordinary local source objects', () => {
    const source = {
      uri: 'file:///tmp/profile-avatar.jpg',
      headers: { Authorization: 'Bearer local-token' },
    };

    render(<SecureImage source={source} />);

    const props = getLatestExpoImageProps();

    expect(props.source).toBe(source);
    expect(props.recyclingKey).toBeUndefined();
  });

  it('respects an explicit null recycling key for render URLs', () => {
    const uri = 'https://api.foodlens.test/media/render/asset-1?exp=100&sig=first';

    render(<SecureImage source={uri} recyclingKey={null} />);

    const props = getLatestExpoImageProps();
    const source = expectCapturedSourceObject(props.source);

    expect(source).toEqual({ uri, cacheKey: uri });
    expect(props.recyclingKey).toBeNull();
  });

  it('applies signed render cache identity to array sources', () => {
    const renderUri = 'https://api.foodlens.test/media/render/asset-1?exp=100&sig=first';
    const ordinaryUri = 'https://cdn.foodlens.test/fallback.jpg';

    render(<SecureImage source={[renderUri, ordinaryUri]} />);

    const props = getLatestExpoImageProps();

    if (!Array.isArray(props.source)) {
      throw new Error('Expected ExpoImage source to be an array.');
    }

    expect(props.source).toEqual([
      { uri: renderUri, cacheKey: renderUri },
      { uri: ordinaryUri },
    ]);
    expect(props.recyclingKey).toBe(renderUri);
  });
});
