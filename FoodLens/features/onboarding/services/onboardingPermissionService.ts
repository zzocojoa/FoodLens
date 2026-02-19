import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

export type PermissionResultStatus = 'not_requested' | 'granted' | 'denied' | 'unavailable';

export type OnboardingPermissionResults = {
  camera: PermissionResultStatus;
  library: PermissionResultStatus;
  location: PermissionResultStatus;
};

const toPermissionStatus = (status?: string): PermissionResultStatus => {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  if (status === 'undetermined') return 'not_requested';
  return 'unavailable';
};

export const getOnboardingPermissionStatuses = async (): Promise<OnboardingPermissionResults> => {
  const results: OnboardingPermissionResults = {
    camera: 'unavailable',
    library: 'unavailable',
    location: 'unavailable',
  };

  try {
    const response = await Camera.getCameraPermissionsAsync();
    results.camera = toPermissionStatus(response?.status);
  } catch {
    results.camera = 'unavailable';
  }

  try {
    const response = await ImagePicker.getMediaLibraryPermissionsAsync();
    results.library = toPermissionStatus(response?.status);
  } catch {
    results.library = 'unavailable';
  }

  try {
    const response = await Location.getForegroundPermissionsAsync();
    results.location = toPermissionStatus(response?.status);
  } catch {
    results.location = 'unavailable';
  }

  return results;
};

export const requestOnboardingPermissions = async (
  requestCamera: boolean,
  requestLibrary: boolean,
  requestLocation: boolean
): Promise<OnboardingPermissionResults> => {
  const results: OnboardingPermissionResults = {
    camera: 'not_requested',
    library: 'not_requested',
    location: 'not_requested',
  };

  if (requestCamera) {
    try {
      const response = await Camera.requestCameraPermissionsAsync();
      results.camera = toPermissionStatus(response?.status);
    } catch {
      results.camera = 'unavailable';
    }
  }

  if (requestLibrary) {
    try {
      const response = await ImagePicker.requestMediaLibraryPermissionsAsync();
      results.library = toPermissionStatus(response?.status);
    } catch {
      results.library = 'unavailable';
    }
  }

  if (requestLocation) {
    try {
      const response = await Location.requestForegroundPermissionsAsync();
      results.location = toPermissionStatus(response?.status);
    } catch {
      results.location = 'unavailable';
    }
  }

  return results;
};
