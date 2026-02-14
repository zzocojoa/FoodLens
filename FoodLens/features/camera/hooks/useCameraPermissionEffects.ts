import { useEffect } from 'react';
import { PermissionResponse } from 'expo-image-picker';
import { getCameraErrorMessages } from '../constants/camera.constants';
import { useI18n } from '@/features/i18n';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';

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
        showTranslatedAlert(t, {
          titleKey: 'camera.alert.errorTitle',
          titleFallback: 'Error',
          messageKey: 'camera.error.missingImage',
          messageFallback: messages.missingImage,
        });
        onExit();
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [permission, externalImageUri, onExit, messages.missingImage, t]);
};
