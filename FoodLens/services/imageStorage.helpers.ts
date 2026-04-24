import * as FileSystem from 'expo-file-system/legacy';

export const IMAGE_DIR = 'foodlens_images/';
const DEFAULT_IMAGE_EXTENSION = 'jpg';
const SAFE_EXTENSION_PATTERN = /^[a-zA-Z0-9]{1,10}$/;

export const toDocumentDirectory = (): string => {
  const documentDirectory = FileSystem.documentDirectory ?? '';
  return documentDirectory.endsWith('/') ? documentDirectory : `${documentDirectory}/`;
};

export const getManagedImageDirectory = (): string => `${toDocumentDirectory()}${IMAGE_DIR}`;

export const isLegacyAbsoluteUri = (uri: string): boolean =>
  uri.startsWith('file://') ||
  uri.startsWith('/') ||
  uri.startsWith('ph://') ||
  uri.startsWith('content://') ||
  uri.startsWith('assets-library://') ||
  uri.startsWith('http://') ||
  uri.startsWith('https://') ||
  uri.toLowerCase().startsWith('data:image/');

export const isManagedImageReference = (uri: string): boolean => uri.includes(IMAGE_DIR);

export const extractFilename = (uri: string): string | null => uri.split('/').pop() || null;

const stripQueryAndFragment = (uri: string): string => uri.split(/[?#]/)[0] ?? uri;

const stripTrailingSlashes = (uri: string): string => uri.replace(/\/+$/, '');

const extractLastPathSegment = (uri: string): string => {
  const normalizedUri = stripTrailingSlashes(stripQueryAndFragment(uri));
  const pathSegments = normalizedUri.split('/');
  return pathSegments[pathSegments.length - 1] ?? '';
};

const extractSafeExtension = (segment: string): string | null => {
  const extensionSeparatorIndex = segment.lastIndexOf('.');

  if (extensionSeparatorIndex <= 0 || extensionSeparatorIndex === segment.length - 1) {
    return null;
  }

  const extension = segment.slice(extensionSeparatorIndex + 1);
  return SAFE_EXTENSION_PATTERN.test(extension) ? extension : null;
};

export const extractExtension = (uri: string): string =>
  extractSafeExtension(extractLastPathSegment(uri)) ?? DEFAULT_IMAGE_EXTENSION;

export const createManagedFilename = (sourceUri: string): string => {
  const extension = extractExtension(sourceUri);
  return `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${extension}`;
};

export const buildManagedImageUri = (storedFilename: string): string =>
  `${toDocumentDirectory()}${IMAGE_DIR}${storedFilename}`;
