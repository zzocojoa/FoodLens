import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { logger } from '@/services/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum width/height in pixels for uploaded images. */
const MAX_DIMENSION = 1536;

/** JPEG compression quality (0 = worst, 1 = best). 0.8 is a good balance. */
const JPEG_QUALITY = 0.8;

/** Skip compression if the file is already smaller than this (bytes). */
const SKIP_THRESHOLD_BYTES = 300_000; // 300 KB

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compress and resize an image before uploading to the analysis server.
 *
 * - Resizes to fit within MAX_DIMENSION while preserving aspect ratio.
 * - Converts to JPEG at JPEG_QUALITY.
 * - Skips processing if the original is already small enough.
 * - Returns the URI of the compressed image (or the original if skipped).
 */
export const compressForUpload = async (imageUri: string): Promise<string> => {
  try {
    // --- Guard: skip if already small ---
    const info = await FileSystem.getInfoAsync(imageUri);
    if (info.exists && info.size && info.size < SKIP_THRESHOLD_BYTES) {
      logger.debug('[ImageCompress] Skipped — already small', {
        size: `${(info.size / 1024).toFixed(0)} KB`,
      });
      return imageUri;
    }

    const originalSizeKB = info.exists && info.size ? (info.size / 1024).toFixed(0) : '?';

    // --- Compress ---
    const result = await manipulateAsync(
      imageUri,
      [{ resize: { width: MAX_DIMENSION } }],
      { compress: JPEG_QUALITY, format: SaveFormat.JPEG },
    );

    // --- Log result ---
    const compressedInfo = await FileSystem.getInfoAsync(result.uri);
    const compressedSizeKB =
      compressedInfo.exists && compressedInfo.size
        ? (compressedInfo.size / 1024).toFixed(0)
        : '?';

    logger.info('[ImageCompress] Done', {
      original: `${originalSizeKB} KB`,
      compressed: `${compressedSizeKB} KB`,
      dimension: `${result.width}×${result.height}`,
    });

    return result.uri;
  } catch (error) {
    // Never block the upload if compression fails — send the original.
    logger.warn('[ImageCompress] Failed, using original', { error });
    return imageUri;
  }
};
