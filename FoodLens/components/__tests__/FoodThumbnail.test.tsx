import React from 'react';
import { act, render } from '@testing-library/react-native';

import { FoodThumbnail } from '../FoodThumbnail';

jest.mock('expo-image', () => {
    const ReactModule = jest.requireActual('react') as typeof import('react');
    const { View } = jest.requireActual('react-native') as typeof import('react-native');

    return {
        Image: (props: { [key: string]: unknown }) =>
            ReactModule.createElement(View, { ...props, testID: 'expo-image' }),
    };
});

interface ExpoImageSourceProps {
    uri: string;
    cacheKey?: string;
}

interface ExpoImageRenderedProps {
    source: ExpoImageSourceProps;
    recyclingKey: string;
    onError: () => void;
}

interface UnknownObject {
    [key: string]: unknown;
}

type FoodThumbnailRender = ReturnType<typeof render>;

const isUnknownObject = (value: unknown): value is UnknownObject => typeof value === 'object' && value !== null;

const isExpoImageErrorHandler = (value: unknown): value is () => void => typeof value === 'function';

const readExpoImageProps = (rendered: FoodThumbnailRender): ExpoImageRenderedProps => {
    const rawProps = rendered.getByTestId('expo-image').props as unknown;

    if (!isUnknownObject(rawProps)) {
        throw new Error('Expected mocked ExpoImage props to be an object.');
    }

    const rawSource = rawProps['source'];

    if (!isUnknownObject(rawSource)) {
        throw new Error('Expected mocked ExpoImage source to be an object.');
    }

    const rawUri = rawSource['uri'];

    if (typeof rawUri !== 'string') {
        throw new Error('Expected mocked ExpoImage source uri to be a string.');
    }

    const rawCacheKey = rawSource['cacheKey'];

    if (typeof rawCacheKey !== 'string' && rawCacheKey !== undefined) {
        throw new Error('Expected mocked ExpoImage source cacheKey to be a string when present.');
    }

    const rawRecyclingKey = rawProps['recyclingKey'];

    if (typeof rawRecyclingKey !== 'string') {
        throw new Error('Expected mocked ExpoImage recyclingKey to be a string.');
    }

    const rawOnError = rawProps['onError'];

    if (!isExpoImageErrorHandler(rawOnError)) {
        throw new Error('Expected mocked ExpoImage onError to be a function.');
    }

    const source: ExpoImageSourceProps =
        rawCacheKey === undefined ? { uri: rawUri } : { uri: rawUri, cacheKey: rawCacheKey };

    const onError = rawOnError as () => void;

    return {
        source,
        recyclingKey: rawRecyclingKey,
        onError,
    };
};

describe('FoodThumbnail', () => {
    it('changes render URL source cache identity when the signature query rotates', () => {
        const oldRenderUrl =
            'https://cdn.example.com/media/render/asset_history_1?w=512&q=75&fmt=auto&exp=4102444800&sig=old';
        const newRenderUrl =
            'https://cdn.example.com/media/render/asset_history_1?w=512&q=75&fmt=auto&exp=4102444860&sig=new';
        const rendered = render(<FoodThumbnail uri={oldRenderUrl} emoji="🍜" />);
        const oldImageProps = readExpoImageProps(rendered);

        rendered.rerender(<FoodThumbnail uri={newRenderUrl} emoji="🍜" />);

        const newImageProps = readExpoImageProps(rendered);

        expect(oldImageProps.source).toEqual({ uri: oldRenderUrl, cacheKey: oldRenderUrl });
        expect(oldImageProps.recyclingKey).toBe(oldRenderUrl);
        expect(newImageProps.source).toEqual({ uri: newRenderUrl, cacheKey: newRenderUrl });
        expect(newImageProps.recyclingKey).toBe(newRenderUrl);
        expect(newImageProps.source).not.toEqual(oldImageProps.source);
        expect(newImageProps.recyclingKey).not.toBe(oldImageProps.recyclingKey);
    });

    it('keeps ordinary URI image source and error fallback behavior', () => {
        const ordinaryUri = 'https://cdn.example.com/images/local-preview.jpg';
        const rendered = render(<FoodThumbnail uri={ordinaryUri} emoji="🍙" />);
        const imageProps = readExpoImageProps(rendered);

        expect(imageProps.source).toEqual({ uri: ordinaryUri });
        expect(imageProps.recyclingKey).toBe(ordinaryUri);

        act(() => {
            imageProps.onError();
        });

        expect(rendered.queryByTestId('expo-image')).toBeNull();
        expect(rendered.getByText('🍙')).toBeTruthy();
    });

    it('keeps barcode fallback without mounting ExpoImage', () => {
        const rendered = render(<FoodThumbnail uri="barcode://8801234567890" emoji="🍣" />);

        expect(rendered.queryByTestId('expo-image')).toBeNull();
        expect(rendered.queryByText('🍣')).toBeNull();
    });
});
