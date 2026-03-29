import { ImageFormat, makeImageFromView } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';
import type { RefObject } from 'react';
import { NativeModules, Platform, Share, type View } from 'react-native';
import { logger } from '@/services/logger';

type ShareResultCardInput = {
    viewRef: RefObject<View | null>;
    dialogTitle: string;
    message: string;
    shareTitle: string;
};

type AndroidResultShareModule = {
    shareImageWithText: (
        contentUri: string,
        message: string,
        title: string,
        dialogTitle: string
    ) => Promise<void>;
};

const RESULT_SHARE_MODULE_NAME = 'ResultShareModule';

const getAndroidResultShareModule = (): AndroidResultShareModule => {
    const nativeShareModule = NativeModules[RESULT_SHARE_MODULE_NAME] as AndroidResultShareModule | undefined;

    if (!nativeShareModule || typeof nativeShareModule.shareImageWithText !== 'function') {
        throw new Error('Android result share module is unavailable.');
    }

    return nativeShareModule;
};

const buildShareCardFileUri = (): string => {
    const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

    if (!baseDirectory) {
        throw new Error('Could not resolve a temporary directory for the share card.');
    }

    return `${baseDirectory}foodlens-result-share-${Date.now()}.png`;
};

const waitForNextPaint = async (): Promise<void> =>
    await new Promise((resolve) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
        });
    });

const captureShareCard = async (viewRef: RefObject<View | null>): Promise<string> => {
    await waitForNextPaint();

    const image = await makeImageFromView(viewRef);

    if (!image) {
        throw new Error('Could not capture the result share card.');
    }

    const encodedImage = image.encodeToBase64(ImageFormat.PNG, 100);

    if (!encodedImage || encodedImage.trim().length === 0) {
        throw new Error('Could not encode the result share card image.');
    }

    const fileUri = buildShareCardFileUri();

    await FileSystem.writeAsStringAsync(fileUri, encodedImage, {
        encoding: FileSystem.EncodingType.Base64,
    });

    return fileUri;
};

const deleteShareCardFile = async (fileUri: string | null): Promise<void> => {
    if (!fileUri) {
        return;
    }

    try {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
    } catch (error) {
        logger.warn('Failed to clean temporary share card file', { fileUri, error }, 'ResultShare');
    }
};

export const shareResultCard = async ({
    viewRef,
    dialogTitle,
    message,
    shareTitle,
}: ShareResultCardInput): Promise<void> => {
    let fileUri: string | null = null;

    try {
        fileUri = await captureShareCard(viewRef);

        if (Platform.OS === 'android') {
            const contentUri = await FileSystem.getContentUriAsync(fileUri);
            const nativeShareModule = getAndroidResultShareModule();

            await nativeShareModule.shareImageWithText(
                contentUri,
                message,
                shareTitle,
                dialogTitle
            );

            return;
        }

        await Share.share(
            {
                title: shareTitle,
                message,
                url: fileUri,
            },
            {
                subject: shareTitle,
            }
        );
    } finally {
        await deleteShareCardFile(fileUri);
    }
};
