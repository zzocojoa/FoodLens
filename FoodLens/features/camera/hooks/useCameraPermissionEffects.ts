import { useEffect } from 'react';
import { Alert } from 'react-native';
import { PermissionResponse } from 'expo-image-picker';
import { CAMERA_ERROR_MESSAGES } from '../constants/camera.constants';

type UseCameraPermissionEffectsParams = {
  permission: PermissionResponse | null;
  requestPermission: () => Promise<PermissionResponse>;
  externalImageUri?: string;
  onExit: () => void;
};

export const useCameraPermissionEffects = ({
  permission,
  requestPermission,
  externalImageUri,
  onExit,
}: UseCameraPermissionEffectsParams) => {
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (permission?.granted && !externalImageUri) {
      const timer = setTimeout(() => {
        Alert.alert('오류', CAMERA_ERROR_MESSAGES.missingImage);
        onExit();
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [permission, externalImageUri, onExit]);
};
