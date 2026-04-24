import { persistProfileImageIfNeeded } from '../profileHubStateUtils';

const mockSaveImagePermanentlyOrThrow = jest.fn();

jest.mock('expo-image-picker', () => ({
  __esModule: true,
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: {
    Images: 'Images',
  },
}));

jest.mock('expo-media-library', () => ({
  __esModule: true,
  getAssetInfoAsync: jest.fn(),
  saveToLibraryAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
  },
}));

jest.mock('@/services/imageStorage', () => ({
  saveImagePermanentlyOrThrow: (...args: unknown[]) => mockSaveImagePermanentlyOrThrow(...args),
}));

jest.mock('@/services/native/galleryPicker', () => ({
  pickGalleryImage: jest.fn(),
}));

jest.mock('@/services/ui/permissionDialogs', () => ({
  showOpenSettingsAlert: jest.fn(),
}));

describe('persistProfileImageIfNeeded', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the managed image reference when persistence succeeds', async () => {
    const sourceUri = 'content://media/external/images/media/101';
    const managedReference = 'file:///data/user/0/com.hoihou.foodlens/files/foodlens_images/photo.jpg';
    mockSaveImagePermanentlyOrThrow.mockResolvedValueOnce(managedReference);

    await expect(persistProfileImageIfNeeded(sourceUri)).resolves.toBe(managedReference);
    expect(mockSaveImagePermanentlyOrThrow).toHaveBeenCalledWith(sourceUri, 'Failed to save image.');
  });

  it('falls back to the original uri when persistence fails', async () => {
    const sourceUri = 'content://media/external/images/media/202';
    const persistenceError = new Error('copy failed');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockSaveImagePermanentlyOrThrow.mockRejectedValueOnce(persistenceError);

    await expect(persistProfileImageIfNeeded(sourceUri)).resolves.toBe(sourceUri);
    expect(mockSaveImagePermanentlyOrThrow).toHaveBeenCalledWith(sourceUri, 'Failed to save image.');
    expect(warnSpy).toHaveBeenCalledWith(
      '[ProfileImage] Falling back to original URI without persistence:',
      persistenceError,
    );
  });
});
