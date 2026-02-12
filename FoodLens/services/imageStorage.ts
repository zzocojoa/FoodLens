import * as FileSystem from 'expo-file-system/legacy';

/**
 * ImageStorage Utility
 * 
 * Copies images from the temporary cache to a permanent Documents directory
 * and stores only the filename. This prevents path breakage when the iOS
 * sandbox UUID changes (e.g. Debug → Release builds, app updates).
 */

const IMAGE_DIR = 'foodlens_images/';

/**
 * Get the absolute path of the permanent image directory.
 */
const getImageDir = (): string => {
    // Ensure documentDirectory ends with a slash
    const docDir = FileSystem.documentDirectory?.endsWith('/')
        ? FileSystem.documentDirectory
        : `${FileSystem.documentDirectory}/`;
    return `${docDir}${IMAGE_DIR}`;
};

/**
 * Ensure the permanent image directory exists.
 */
const ensureDir = async (): Promise<void> => {
    const dir = getImageDir();
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
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
    const permanentDir = getImageDir();
    if (cacheUri.includes(IMAGE_DIR)) {
        return cacheUri.split('/').pop() || null;
    }

    try {
        await ensureDir();

        // Generate a unique filename
        const ext = cacheUri.split('.').pop()?.split('?')[0] || 'jpg';
        const filename = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
        const destUri = `${permanentDir}${filename}`;

        await FileSystem.copyAsync({ from: cacheUri, to: destUri });
        console.log(`[ImageStorage] Saved: ${filename}`);
        return filename;
    } catch (error) {
        console.error('[ImageStorage] Failed to copy image:', error);
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
    if (stored.startsWith('file://') || stored.startsWith('/') || stored.startsWith('ph://')) {
        return stored;
    }

    // New format: filename → reconstruct full path
    const docDir = FileSystem.documentDirectory?.endsWith('/')
        ? FileSystem.documentDirectory
        : `${FileSystem.documentDirectory}/`;
        
    return `${docDir}${IMAGE_DIR}${stored}`;
};

/**
 * Delete a permanently stored image.
 */
export const deleteImage = async (stored: string | undefined | null): Promise<void> => {
    if (!stored) return;

    // Only delete files in our managed directory
    if (stored.startsWith('file://') || stored.startsWith('/') || stored.startsWith('ph://')) {
        // Legacy path — don't delete system files
        return;
    }

    const fullPath = `${FileSystem.documentDirectory}${IMAGE_DIR}${stored}`;
    try {
        const info = await FileSystem.getInfoAsync(fullPath);
        if (info.exists) {
            await FileSystem.deleteAsync(fullPath, { idempotent: true });
            console.log(`[ImageStorage] Deleted: ${stored}`);
        }
    } catch (error) {
        console.warn('[ImageStorage] Failed to delete:', error);
    }
};
