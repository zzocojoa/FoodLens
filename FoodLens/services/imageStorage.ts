import * as FileSystem from 'expo-file-system/legacy';
import {
  buildManagedImageUri,
  createManagedFilename,
  extractFilename,
  getManagedImageDirectory,
  isLegacyAbsoluteUri,
  isManagedImageReference,
} from './imageStorage.helpers';

/**
 * ImageStorage Utility
 * 
 * Copies images from the temporary cache to a permanent Documents directory
 * and stores only the filename. This prevents path breakage when the iOS
 * sandbox UUID changes (e.g. Debug → Release builds, app updates).
 */

/**
 * Ensure the permanent image directory exists.
 */
const ensureDir = async (): Promise<void> => {
    const dir = getManagedImageDirectory();
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
};

const LOG_PREFIX = '[ImageStorage]';

/**
 * Save an image permanently by copying from cache/temp to Documents.
 * Returns the filename only (not the full path).
 * 
 * If the URI is already a permanent path (from a previous save), returns its filename.
 * Returns null if the operation fails.
 */
export const saveImagePermanently = async (cacheUri: string): Promise<string | null> => {
    if (!cacheUri) return null;

    // If already in our permanent directory, just extract the filename
    if (isManagedImageReference(cacheUri)) {
        return extractFilename(cacheUri);
    }

    try {
        await ensureDir();

        // Generate a unique filename
        const filename = createManagedFilename(cacheUri);
        const destUri = `${getManagedImageDirectory()}${filename}`;

        await FileSystem.copyAsync({ from: cacheUri, to: destUri });
        console.log(`${LOG_PREFIX} Saved: ${filename}`);
        return filename;
    } catch (error) {
        console.error(`${LOG_PREFIX} Failed to copy image:`, error);
        return null;
    }
};

/**
 * Resolve a stored image reference to an absolute URI.
 * 
 * Handles both:
 * - New format: filename only (e.g. "photo_17xxxxx.jpg")
 * - Legacy format: absolute path (e.g. "file:///var/mobile/.../photo.jpg")
 */
export const resolveImageUri = (stored: string | undefined | null): string | null => {
    if (!stored) return null;

    // Legacy: already an absolute URI → use as-is (may break on reinstall, but best effort)
    if (isLegacyAbsoluteUri(stored)) {
        return stored;
    }

    // New format: filename → reconstruct full path
    return buildManagedImageUri(stored);
};

/**
 * Delete a permanently stored image.
 */
export const deleteImage = async (stored: string | undefined | null): Promise<void> => {
    if (!stored) return;

    // Only delete files in our managed directory
    if (isLegacyAbsoluteUri(stored)) {
        // Legacy path — don't delete system files
        return;
    }

    const fullPath = buildManagedImageUri(stored);
    try {
        const info = await FileSystem.getInfoAsync(fullPath);
        if (info.exists) {
            await FileSystem.deleteAsync(fullPath, { idempotent: true });
            console.log(`${LOG_PREFIX} Deleted: ${stored}`);
        }
    } catch (error) {
        console.warn(`${LOG_PREFIX} Failed to delete:`, error);
    }
};
