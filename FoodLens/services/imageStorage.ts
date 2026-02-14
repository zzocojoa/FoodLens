import * as FileSystem from 'expo-file-system/legacy';
import { getStoredAnalyses } from './analysis/storage';
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
const MIN_REQUIRED_SPACE = 50 * 1024 * 1024; // 50MB

/**
 * Check if there is enough disk space for saving a new image.
 */
export const hasSufficientSpace = async (): Promise<boolean> => {
    try {
        const freeSpace = await FileSystem.getFreeDiskStorageAsync();
        return freeSpace > MIN_REQUIRED_SPACE;
    } catch (error) {
        console.warn(`${LOG_PREFIX} Failed to check free disk storage:`, error);
        return true; // Fallback to true to avoid blocking usage if check fails
    }
};

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
        // Professional check: Ensure sufficient space
        const spaceOk = await hasSufficientSpace();
        if (!spaceOk) {
            console.error(`${LOG_PREFIX} Insufficient disk space to save image.`);
            return null;
        }

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
 * Save image permanently and throw when persistence fails.
 */
export const saveImagePermanentlyOrThrow = async (
    cacheUri: string,
    errorMessage: string
): Promise<string> => {
    const savedFilename = await saveImagePermanently(cacheUri);
    if (!savedFilename) {
        throw new Error(errorMessage);
    }
    return savedFilename;
};

/**
 * Clean up images that are no longer referenced in the history.
 */
export const cleanupOrphanedImages = async (): Promise<void> => {
    try {
        const dir = getManagedImageDirectory();
        const dirInfo = await FileSystem.getInfoAsync(dir);
        if (!dirInfo.exists) return;

        const files = await FileSystem.readDirectoryAsync(dir);
        const analyses = await getStoredAnalyses();
        
        // Extract all referenced filenames from history
        const referencedFiles = new Set(
            analyses
                .map(a => a.imageUri)
                .filter(uri => uri && !isLegacyAbsoluteUri(uri))
        );

        let count = 0;
        for (const file of files) {
            if (!referencedFiles.has(file)) {
                await FileSystem.deleteAsync(`${dir}${file}`, { idempotent: true });
                count++;
            }
        }

        if (count > 0) {
            console.log(`${LOG_PREFIX} Cleaned up ${count} orphaned images.`);
        }
    } catch (error) {
        console.error(`${LOG_PREFIX} Failed to cleanup orphaned images:`, error);
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
export const getBarcodeImageUri = (): string => 'barcode://pattern';

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
