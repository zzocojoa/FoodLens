import {
  getOnboardingPermissionStatuses,
  requestOnboardingPermissions,
} from '../onboardingPermissionService';

const mockGetCameraPermissionsAsync = jest.fn();
const mockRequestCameraPermissionsAsync = jest.fn();
const mockGetMediaLibraryPermissionsAsync = jest.fn();
const mockRequestMediaLibraryPermissionsAsync = jest.fn();
const mockGetForegroundPermissionsAsync = jest.fn();
const mockRequestForegroundPermissionsAsync = jest.fn();

jest.mock('expo-camera', () => ({
  Camera: {
    getCameraPermissionsAsync: (...args: unknown[]) => mockGetCameraPermissionsAsync(...args),
    requestCameraPermissionsAsync: (...args: unknown[]) => mockRequestCameraPermissionsAsync(...args),
  },
}));

jest.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: (...args: unknown[]) => mockGetMediaLibraryPermissionsAsync(...args),
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockRequestMediaLibraryPermissionsAsync(...args),
}));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: (...args: unknown[]) => mockGetForegroundPermissionsAsync(...args),
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockRequestForegroundPermissionsAsync(...args),
}));

describe('onboardingPermissionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'denied' });
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  });

  it('maps permission status checks without prompting', async () => {
    await expect(getOnboardingPermissionStatuses()).resolves.toEqual({
      camera: 'granted',
      library: 'denied',
      location: 'not_requested',
    });

    expect(mockGetCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockGetMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockGetForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockRequestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(mockRequestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests only permissions selected by an explicit action', async () => {
    await expect(requestOnboardingPermissions(true, false, false)).resolves.toEqual({
      camera: 'granted',
      library: 'not_requested',
      location: 'not_requested',
    });

    expect(mockRequestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockRequestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});
