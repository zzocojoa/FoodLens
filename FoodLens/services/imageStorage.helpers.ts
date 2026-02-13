import * as FileSystem from 'expo-file-system/legacy';

export const IMAGE_DIR = 'foodlens_images/';

export const toDocumentDirectory = (): string => {
  const documentDirectory = FileSystem.documentDirectory ?? '';
  return documentDirectory.endsWith('/') ? documentDirectory : `${documentDirectory}/`;
};

export const getManagedImageDirectory = (): string => `${toDocumentDirectory()}${IMAGE_DIR}`;

export const isLegacyAbsoluteUri = (uri: string): boolean =>
  uri.startsWith('file://') || uri.startsWith('/') || uri.startsWith('ph://');

export const isManagedImageReference = (uri: string): boolean => uri.includes(IMAGE_DIR);

export const extractFilename = (uri: string): string | null => uri.split('/').pop() || null;

export const extractExtension = (uri: string): string => uri.split('.').pop()?.split('?')[0] || 'jpg';

export const createManagedFilename = (sourceUri: string): string => {
  const extension = extractExtension(sourceUri);
  return `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${extension}`;
};

export const buildManagedImageUri = (storedFilename: string): string =>
  `${toDocumentDirectory()}${IMAGE_DIR}${storedFilename}`;
