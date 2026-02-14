import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { decimalToDMS, validateCoordinates } from '@/services/utils/coordinates';
import { logger } from '@/services/logger';

const piexif = require('piexifjs');
const LOG_PREFIX = '[PhotoLibraryGPS]';

export type PhotoSaveResult =
  | { status: 'saved' }
  | { status: 'denied' }
  | { status: 'error'; error: unknown };

type LocationLike = {
  latitude?: number | string;
  longitude?: number | string;
} | null | undefined;

const toJpegDataUrl = (base64: string) => `data:image/jpeg;base64,${base64}`;

const toBase64FromDataUrl = (dataUrl: string) =>
  dataUrl.replace(/^data:image\/jpeg;base64,/, '');

const buildGpsExif = (
  existingExif: Record<string, any>,
  latitude: number,
  longitude: number
) => {
  const gps = existingExif['GPS'] || {};
  gps[piexif.GPSIFD.GPSVersionID] = [2, 3, 0, 0];
  gps[piexif.GPSIFD.GPSLatitudeRef] = latitude >= 0 ? 'N' : 'S';
  gps[piexif.GPSIFD.GPSLatitude] = decimalToDMS(latitude);
  gps[piexif.GPSIFD.GPSLongitudeRef] = longitude >= 0 ? 'E' : 'W';
  gps[piexif.GPSIFD.GPSLongitude] = decimalToDMS(longitude);

  return {
    '0th': existingExif['0th'] || {},
    Exif: existingExif['Exif'] || {},
    GPS: gps,
    Interop: existingExif['Interop'] || {},
    '1st': existingExif['1st'] || {},
    thumbnail: existingExif['thumbnail'] || null,
  };
};

const writeJpegWithGpsExif = async (
  imageUri: string,
  location: LocationLike
): Promise<string | null> => {
  if (!location) {
    logger.debug('skip exif: location is null/undefined', undefined, LOG_PREFIX);
    return null;
  }
  const validated = validateCoordinates(location.latitude, location.longitude);
  if (!validated) {
    logger.debug('skip exif: invalid coordinates', {
      latitude: location.latitude,
      longitude: location.longitude,
    }, LOG_PREFIX);
    return null;
  }
  logger.debug('exif candidate coords', validated, LOG_PREFIX);

  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64 || base64.length === 0) {
    logger.debug('skip exif: base64 image empty', undefined, LOG_PREFIX);
    return null;
  }
  logger.debug('source image loaded', { uri: imageUri, base64Len: base64.length }, LOG_PREFIX);

  const jpegDataUrl = toJpegDataUrl(base64);
  let existingExif: Record<string, any>;

  try {
    existingExif = piexif.load(jpegDataUrl) as unknown as Record<string, any>;
    logger.debug('existing exif loaded', undefined, LOG_PREFIX);
  } catch {
    logger.debug('existing exif load failed, creating fresh exif block', undefined, LOG_PREFIX);
    existingExif = {
      '0th': {},
      Exif: {},
      GPS: {},
      Interop: {},
      '1st': {},
      thumbnail: null,
    };
  }

  const exif = buildGpsExif(existingExif, validated.latitude, validated.longitude);
  const exifBytes = piexif.dump(exif as any);
  const outputDataUrl = piexif.insert(exifBytes, jpegDataUrl);
  const outputBase64 = toBase64FromDataUrl(outputDataUrl);
  logger.debug('gps exif inserted', {
    latRef: validated.latitude >= 0 ? 'N' : 'S',
    lngRef: validated.longitude >= 0 ? 'E' : 'W',
  }, LOG_PREFIX);

  const tempDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
  const tempUri = `${tempDir}foodlens_geo_${Date.now()}.jpg`;

  await FileSystem.writeAsStringAsync(tempUri, outputBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  logger.debug('temp jpeg with gps exif written', { tempUri }, LOG_PREFIX);

  return tempUri;
};

const logGpsFromJpegIfPossible = async (uri: string) => {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64) return;
    const exif = piexif.load(toJpegDataUrl(base64)) as Record<string, any>;
    const gps = exif?.['GPS'] || {};
    logger.debug('verify jpeg gps', {
      uri,
      hasGps: Object.keys(gps).length > 0,
      latRef: gps[piexif.GPSIFD.GPSLatitudeRef],
      lngRef: gps[piexif.GPSIFD.GPSLongitudeRef],
      lat: gps[piexif.GPSIFD.GPSLatitude],
      lng: gps[piexif.GPSIFD.GPSLongitude],
    }, LOG_PREFIX);
  } catch (error) {
    logger.debug('verify jpeg gps skipped', { uri, error: String(error) }, LOG_PREFIX);
  }
};

const ensureMediaLibraryPermission = async (): Promise<boolean> => {
  const current = await MediaLibrary.getPermissionsAsync();
  let permission = current;
  logger.debug('media permission status', {
    granted: current.granted,
    canAskAgain: current.canAskAgain,
    status: current.status,
  }, LOG_PREFIX);

  if (!permission.granted) {
    permission = await MediaLibrary.requestPermissionsAsync();
    logger.debug('media permission requested', {
      granted: permission.granted,
      canAskAgain: permission.canAskAgain,
      status: permission.status,
    }, LOG_PREFIX);
  }

  if (!permission.granted) {
    logger.info('save aborted: permission denied', undefined, LOG_PREFIX);
    return false;
  }

  return true;
};

const resolveUriToSave = async (
  imageUri: string,
  location?: LocationLike
): Promise<{ uriToSave: string; tempUri: string | null }> => {
  let uriToSave = imageUri;
  let tempUri: string | null = null;

  try {
    tempUri = await writeJpegWithGpsExif(imageUri, location);
    if (tempUri) {
      uriToSave = tempUri;
    }
  } catch (error) {
    logger.warn('Failed to write GPS EXIF, fallback to original', error, 'PhotoLibrary');
  }

  logger.debug('saving to library', {
    sourceUri: imageUri,
    uriToSave,
    usedTempExifFile: !!tempUri,
  }, LOG_PREFIX);

  return { uriToSave, tempUri };
};

const saveAssetWithDiagnostics = async (uriToSave: string) => {
  await logGpsFromJpegIfPossible(uriToSave);

  const asset = await MediaLibrary.createAssetAsync(uriToSave);
  logger.info('saved to library successfully', {
    uriToSave,
    assetId: asset.id,
    assetFilename: asset.filename,
  }, LOG_PREFIX);

  const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
  logger.debug('asset info after save', {
    assetId: asset.id,
    filename: assetInfo.filename,
    location: assetInfo.location || null,
    hasLocation: !!assetInfo.location,
  }, LOG_PREFIX);
};

const cleanupTempFileIfNeeded = async (tempUri: string | null) => {
  if (!tempUri) return;
  await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
  logger.debug('temp file cleaned', { tempUri }, LOG_PREFIX);
};

export const photoLibraryService = {
  async saveImageToLibrary(
    imageUri: string,
    location?: LocationLike
  ): Promise<PhotoSaveResult> {
    let tempUri: string | null = null;

    try {
      const granted = await ensureMediaLibraryPermission();
      if (!granted) {
        return { status: 'denied' };
      }

      const resolved = await resolveUriToSave(imageUri, location);
      tempUri = resolved.tempUri;
      await saveAssetWithDiagnostics(resolved.uriToSave);
      await cleanupTempFileIfNeeded(tempUri);
      return { status: 'saved' };
    } catch (error) {
      logger.warn('Failed to save image to device library', error, 'PhotoLibrary');
      await cleanupTempFileIfNeeded(tempUri);
      return { status: 'error', error };
    }
  },
};
