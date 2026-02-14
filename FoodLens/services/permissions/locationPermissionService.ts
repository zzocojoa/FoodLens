import * as Location from 'expo-location';

export type LocationPermissionResult =
  | { granted: true }
  | { granted: false; canAskAgain?: boolean };

export const ensureForegroundLocationPermission = async (): Promise<LocationPermissionResult> => {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === 'granted') {
    return { granted: true };
  }

  const requested = await Location.requestForegroundPermissionsAsync();
  if (requested.status === 'granted') {
    return { granted: true };
  }

  return { granted: false, canAskAgain: requested.canAskAgain };
};
