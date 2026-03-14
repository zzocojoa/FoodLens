import { useCallback } from 'react';
import { PermissionResponse } from 'expo-camera';
import { showOpenSettingsAlert } from '@/services/ui/permissionDialogs';

type Translate = (key: string, fallback?: string) => string;

type UseScanPermissionFlowParams = {
  requestPermission: () => Promise<PermissionResponse>;
  t: Translate;
};

export const useScanPermissionFlow = ({
  requestPermission,
  t,
}: UseScanPermissionFlowParams) => {
  return useCallback(async () => {
    const result = await requestPermission();
    if (!result.granted && !result.canAskAgain) {
      showOpenSettingsAlert({
        title: t('profile.permission.cameraRequiredTitle', 'Camera Permission Required'),
        message: t('scan.permission.cameraRequired', 'Camera access is required.'),
        cancelLabel: t('common.cancel', 'Cancel'),
        settingsLabel: t('scan.permission.openSettings', 'Open Settings'),
      });
    }
    return result;
  }, [requestPermission, t]);
};
