import * as ImagePicker from 'expo-image-picker';
import { pickGalleryImage } from '@/services/native/galleryPicker';
import { showOpenSettingsAlert } from '@/services/ui/permissionDialogs';
import { persistProfileImageIfNeeded, pickProfileImageUri } from '../profileSheetStateUtils';

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

  it('raises the persistence error when saving the image fails', async () => {
    const sourceUri = 'content://media/external/images/media/202';
    const persistenceError = new Error('copy failed');
    mockSaveImagePermanentlyOrThrow.mockRejectedValueOnce(persistenceError);

    await expect(persistProfileImageIfNeeded(sourceUri)).rejects.toThrow(persistenceError);
    expect(mockSaveImagePermanentlyOrThrow).toHaveBeenCalledWith(sourceUri, 'Failed to save image.');
  });
});

describe('pickProfileImageUri', () => {
  const permissionDialogTexts = {
    title: 'Photo Library Permission Required',
    message: 'Photo library access is required to choose a profile photo.',
    cancelLabel: 'Cancel',
    settingsLabel: 'Open Settings',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the Expo image library crop and compression path for gallery images', async () => {
    const pickedUri = 'file:///tmp/cropped-gallery.jpg';
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValueOnce({
      granted: true,
    } as ImagePicker.MediaLibraryPermissionResponse);
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: pickedUri }],
    } as ImagePicker.ImagePickerResult);

    await expect(pickProfileImageUri(false, permissionDialogTexts)).resolves.toBe(pickedUri);

    expect(pickGalleryImage).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      legacy: false,
    });
  });

  it('returns null and opens settings when gallery permission is denied', async () => {
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValueOnce({
      granted: false,
    } as ImagePicker.MediaLibraryPermissionResponse);

    await expect(pickProfileImageUri(false, permissionDialogTexts)).resolves.toBeNull();

    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(showOpenSettingsAlert).toHaveBeenCalledWith(permissionDialogTexts);
  });
});
