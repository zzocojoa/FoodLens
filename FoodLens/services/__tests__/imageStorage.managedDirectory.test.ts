const mockGetInfoAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockGetStoredAnalyses = jest.fn();
const mockSafeStorageGet = jest.fn();
const mockSafeStorageGetAllKeys = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  default: {
    documentDirectory: 'file:///documents/',
    getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
    deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
  },
  documentDirectory: 'file:///documents/',
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    get: (...args: unknown[]) => mockSafeStorageGet(...args),
    getAllKeys: (...args: unknown[]) => mockSafeStorageGetAllKeys(...args),
    remove: jest.fn(),
  },
}));

jest.mock('../analysis/storage', () => ({
  getStoredAnalyses: (...args: unknown[]) => mockGetStoredAnalyses(...args),
}));

import { clearManagedImageDirectory, clearManagedImagesForUser, deleteImage } from '../imageStorage';

describe('clearManagedImageDirectory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInfoAsync.mockResolvedValue({
      exists: true,
      isDirectory: true,
    });
    mockDeleteAsync.mockResolvedValue(undefined);
    mockGetStoredAnalyses.mockResolvedValue([]);
    mockSafeStorageGet.mockResolvedValue(null);
    mockSafeStorageGetAllKeys.mockResolvedValue([]);
  });

  it('deletes the managed image directory', async () => {
    await clearManagedImageDirectory();

    expect(mockGetInfoAsync).toHaveBeenCalledWith('file:///documents/foodlens_images/');
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///documents/foodlens_images/', {
      idempotent: true,
    });
  });

  it('does not delete when the managed image directory is absent', async () => {
    mockGetInfoAsync.mockResolvedValue({
      exists: false,
    });

    await clearManagedImageDirectory();

    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it('rejects when managed image directory deletion fails', async () => {
    mockDeleteAsync.mockRejectedValue(new Error('directory delete failed'));

    await expect(clearManagedImageDirectory()).rejects.toThrow('directory delete failed');
  });

  it('rejects when the managed image path is not a directory', async () => {
    mockGetInfoAsync.mockResolvedValue({
      exists: true,
      isDirectory: false,
    });

    await expect(clearManagedImageDirectory()).rejects.toThrow('Managed image path is not a directory.');
  });

  it('clears only managed images referenced by the selected user', async () => {
    mockGetStoredAnalyses.mockResolvedValue([
      { id: 'analysis-a', imageUri: 'photo_a.jpg' },
      { id: 'analysis-remote', imageUri: 'https://cdn.example.com/render.jpg' },
      { id: 'analysis-managed-absolute', imageUri: 'file:///documents/foodlens_images/photo_abs.jpg' },
    ]);
    mockSafeStorageGet.mockImplementation(async (key: unknown) => {
      if (key === '@foodlens_user_profile:usr_a') {
        return {
          profileImage: 'profile_a.jpg',
          photoURL: 'barcode://pattern',
        };
      }
      return null;
    });

    await clearManagedImagesForUser('usr_a');

    expect(mockGetStoredAnalyses).toHaveBeenCalledWith('usr_a');
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///documents/foodlens_images/photo_a.jpg', {
      idempotent: true,
    });
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///documents/foodlens_images/photo_abs.jpg', {
      idempotent: true,
    });
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///documents/foodlens_images/profile_a.jpg', {
      idempotent: true,
    });
    expect(mockDeleteAsync).not.toHaveBeenCalledWith('file:///documents/foodlens_images/', {
      idempotent: true,
    });
  });

  it('clears matching legacy profile managed images for the selected user', async () => {
    mockSafeStorageGet.mockImplementation(async (key: unknown) => {
      if (key === '@foodlens_user_profile') {
        return {
          uid: 'usr_a',
          profileImage: 'legacy_profile.jpg',
        };
      }
      return null;
    });

    await clearManagedImagesForUser('usr_a');

    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///documents/foodlens_images/legacy_profile.jpg', {
      idempotent: true,
    });
  });

  it('clears legacy analysis managed images for the selected user wipe', async () => {
    mockGetStoredAnalyses.mockResolvedValue([{ id: 'analysis-a', imageUri: 'scoped_a.jpg' }]);
    mockSafeStorageGet.mockImplementation(async (key: unknown) => {
      if (key === '@foodlens_analyses') {
        return [{ id: 'legacy-analysis-a', imageUri: 'legacy_a.jpg' }];
      }
      return null;
    });

    await clearManagedImagesForUser('usr_a');

    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///documents/foodlens_images/scoped_a.jpg', {
      idempotent: true,
    });
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///documents/foodlens_images/legacy_a.jpg', {
      idempotent: true,
    });
  });

  it('does not clear legacy profile images for another user', async () => {
    mockSafeStorageGet.mockImplementation(async (key: unknown) => {
      if (key === '@foodlens_user_profile') {
        return {
          uid: 'usr_b',
          profileImage: 'legacy_profile_b.jpg',
        };
      }
      return null;
    });

    await clearManagedImagesForUser('usr_a');

    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it('does not clear managed images that another scoped user still references', async () => {
    mockGetStoredAnalyses.mockResolvedValue([
      { id: 'analysis-a', imageUri: 'shared.jpg' },
      { id: 'analysis-a-only', imageUri: 'only_a.jpg' },
    ]);
    mockSafeStorageGetAllKeys.mockResolvedValue(['@foodlens_analyses:usr_b']);
    mockSafeStorageGet.mockImplementation(async (key: unknown) => {
      if (key === '@foodlens_analyses:usr_b') {
        return [{ id: 'analysis-b', imageUri: 'shared.jpg' }];
      }
      return null;
    });

    await clearManagedImagesForUser('usr_a');

    expect(mockDeleteAsync).not.toHaveBeenCalledWith('file:///documents/foodlens_images/shared.jpg', {
      idempotent: true,
    });
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///documents/foodlens_images/only_a.jpg', {
      idempotent: true,
    });
  });

  it('rejects when selected user image deletion fails', async () => {
    mockGetStoredAnalyses.mockResolvedValue([{ id: 'analysis-a', imageUri: 'photo_a.jpg' }]);
    mockDeleteAsync.mockRejectedValue(new Error('user image delete failed'));

    await expect(clearManagedImagesForUser('usr_a')).rejects.toThrow('Failed to clear managed images for user');
  });

  it('rejects when a managed image delete fails', async () => {
    mockDeleteAsync.mockRejectedValue(new Error('image delete failed'));

    await expect(deleteImage('photo_a.jpg')).rejects.toThrow('image delete failed');
  });
});
