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
import { SafeStorage } from './storage';
import { getUserStorageKey, USER_STORAGE_KEY } from './user/constants';
import { UserProfile } from '../models/User';
import { getCurrentUserId, hasAuthenticatedUser } from './auth/currentUser';

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
const isExternalImageReference = (value: string): boolean => {
    const normalized = value.toLowerCase();
    return normalized.startsWith('http://') ||
        normalized.startsWith('https://') ||
        normalized.startsWith('data:image/') ||
        normalized.startsWith('barcode://');
};

const normalizeUserId = (userId: string): string => {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
        throw new Error('User id is required to clear managed images.');
    }
    return normalizedUserId;
};

const resolveManagedImagePath = (stored: string | undefined | null): string | null => {
    if (!stored) return null;
    if (isExternalImageReference(stored)) return null;

    if (isManagedImageReference(stored)) {
        const filename = extractFilename(stored);
        return filename ? buildManagedImageUri(filename) : null;
    }

    if (isLegacyAbsoluteUri(stored)) return null;
    return buildManagedImageUri(stored);
};

const collectUserManagedImagePaths = async (userId: string): Promise<string[]> => {
    const normalizedUserId = normalizeUserId(userId);
    const analyses = await getStoredAnalyses(normalizedUserId);
    const profile = await SafeStorage.get<UserProfile | null>(getUserStorageKey(normalizedUserId), null);
    const legacyProfile = await SafeStorage.get<UserProfile | null>(USER_STORAGE_KEY, null);
    const matchingLegacyProfile = legacyProfile?.uid === normalizedUserId ? legacyProfile : null;
    const references = [
        ...analyses.map((analysis) => analysis.imageUri),
        profile?.profileImage,
        profile?.photoURL,
        matchingLegacyProfile?.profileImage,
        matchingLegacyProfile?.photoURL,
    ];
    return [...new Set(references.map(resolveManagedImagePath).filter((path): path is string => Boolean(path)))];
};

const deleteManagedImagePath = async (path: string): Promise<void> => {
    try {
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) return;
        await FileSystem.deleteAsync(path, { idempotent: true });
        console.log(`${LOG_PREFIX} Deleted managed image.`);
    } catch (error) {
        console.error(`${LOG_PREFIX} Failed to delete managed image.`, {
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
};

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
        if (!hasAuthenticatedUser()) return;
        const userId = getCurrentUserId();
        const dir = getManagedImageDirectory();
        const dirInfo = await FileSystem.getInfoAsync(dir);
        if (!dirInfo.exists) return;

        const files = await FileSystem.readDirectoryAsync(dir);
        const analyses = await getStoredAnalyses(userId);
        
        // Extract all referenced filenames from history
        const referencedFiles = new Set(
            analyses
                .map(a => a.imageUri)
                .filter(uri => uri && !isLegacyAbsoluteUri(uri) && !isExternalImageReference(uri))
        );

        // Preserve current profile image as well (it is not part of analysis history).
        const profile = await SafeStorage.get<UserProfile | null>(getUserStorageKey(userId), null);
        const profileImage = profile?.profileImage;
        if (profileImage) {
            if (isManagedImageReference(profileImage)) {
                const profileFilename = extractFilename(profileImage);
                if (profileFilename) {
                    referencedFiles.add(profileFilename);
                }
            } else if (!isLegacyAbsoluteUri(profileImage) && !isExternalImageReference(profileImage)) {
                referencedFiles.add(profileImage);
            }
        }

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

export const clearManagedImageDirectory = async (): Promise<void> => {
    if (!FileSystem.documentDirectory) {
        throw new Error('FileSystem.documentDirectory is required to clear managed FoodLens images.');
    }

    const dir = getManagedImageDirectory();

    try {
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) return;
        if ('isDirectory' in info && info.isDirectory === false) {
            throw new Error('Managed image path is not a directory.');
        }
        await FileSystem.deleteAsync(dir, { idempotent: true });
        console.log(`${LOG_PREFIX} Managed image directory cleared.`, {
            directory: dir,
        });
    } catch (error) {
        console.error(`${LOG_PREFIX} Failed to clear managed image directory.`, {
            directory: dir,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
};

export const clearManagedImagesForUser = async (userId: string): Promise<void> => {
    const paths = await collectUserManagedImagePaths(userId);
    const failures: unknown[] = [];

    for (const path of paths) {
        try {
            await deleteManagedImagePath(path);
        } catch (error) {
            failures.push(error);
        }
    }

    if (failures.length > 0) {
        console.error(`${LOG_PREFIX} Failed to clear managed images for user.`, {
            failureCount: failures.length,
            errors: failures.map((error) => (error instanceof Error ? error.message : String(error))),
        });
        throw new Error(`Failed to clear managed images for user: ${normalizeUserId(userId)}`);
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

    if (isExternalImageReference(stored)) {
        return stored;
    }

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
    const fullPath = resolveManagedImagePath(stored);
    if (!fullPath) return;
    await deleteManagedImagePath(fullPath);
};
