import { useEffect } from 'react';
import { Alert } from 'react-native';
import { PermissionResponse } from 'expo-image-picker';
import { getCameraErrorMessages } from '../constants/camera.constants';
import { useI18n } from '@/features/i18n';

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
  const { t } = useI18n();
  const messages = getCameraErrorMessages(t);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (permission?.granted && !externalImageUri) {
      const timer = setTimeout(() => {
        Alert.alert(
          t('camera.alert.errorTitle', 'Error'),
          messages.missingImage
        );
        onExit();
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [permission, externalImageUri, onExit, messages.missingImage, t]);
};
