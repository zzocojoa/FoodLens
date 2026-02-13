import * as MediaLibrary from 'expo-media-library';
import { ImagePickerAsset } from 'expo-image-picker';

import { extractLocationFromExif } from '../../../services/utils';
import { LocationData } from '../../../services/utils/types';

type GalleryMetadata = {
    timestamp: string | null;
    exifLocation: LocationData | null;
};

export const resolveGalleryMetadata = async (asset: ImagePickerAsset): Promise<GalleryMetadata> => {
    let finalDate = asset.exif?.['DateTimeOriginal'] || asset.exif?.['DateTime'] || null;

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
