import * as MediaLibrary from 'expo-media-library';

import { extractLocationFromExif } from '../../../services/utils';

type GalleryMetadata = {
    timestamp: string | null;
    exifLocation: any;
};

export const resolveGalleryMetadata = async (asset: any): Promise<GalleryMetadata> => {
    let finalDate = asset.exif?.DateTimeOriginal || asset.exif?.DateTime || null;

    let exifLocation = null;
    try {
        exifLocation = await extractLocationFromExif(asset.exif);
    } catch (error) {
        console.warn('[Gallery] Failed to parse EXIF location:', error);
    }

    if (!finalDate && asset.assetId) {
        try {
            const permissionResult = await MediaLibrary.requestPermissionsAsync();
            if (permissionResult.granted) {
                const info = await MediaLibrary.getAssetInfoAsync(asset.assetId);
                if (info && info.creationTime) {
                    finalDate = new Date(info.creationTime).toISOString();
                }
            }
        } catch (error) {
            console.warn('[Gallery] MediaLibrary lookup failed:', error);
        }
    }

    return { timestamp: finalDate, exifLocation };
};

