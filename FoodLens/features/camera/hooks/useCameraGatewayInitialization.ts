import { MutableRefObject, useEffect } from 'react';
import { Alert } from 'react-native';
import { getCameraErrorMessages } from '../constants/camera.constants';
import { CameraSourceType, LocationContext } from '../types/camera.types';
import { resolveInitialLocationContext } from '../utils/cameraGatewayHelpers';
import { useI18n } from '@/features/i18n';

type UseCameraGatewayInitializationParams = {
  photoLat?: string;
  photoLng?: string;
  sourceType?: CameraSourceType;
  externalImageUri?: string;
  processImage: (uri: string) => Promise<void>;
  cachedLocation: MutableRefObject<LocationContext | null | undefined>;
  setIsLocationReady: (value: boolean) => void;
};

export const useCameraGatewayInitialization = ({
  photoLat,
  photoLng,
  sourceType,
  externalImageUri,
  processImage,
  cachedLocation,
  setIsLocationReady,
}: UseCameraGatewayInitializationParams) => {
  const { t } = useI18n();
  const messages = getCameraErrorMessages(t);

  useEffect(() => {
    const initLocation = async () => {
      const resolvedLocation = await resolveInitialLocationContext({
        photoLat,
        photoLng,
        sourceType,
      });
      cachedLocation.current = resolvedLocation;

      if (!resolvedLocation && sourceType === 'camera') {
        setTimeout(() => {
          Alert.alert(
            t('camera.alert.locationUnavailableTitle', 'Location Unavailable'),
            messages.locationUnavailable
          );
        }, 500);
      }

      setIsLocationReady(true);

      if (externalImageUri) {
        await processImage(externalImageUri);
      }
    };

    void initLocation();
  }, [cachedLocation, externalImageUri, photoLat, photoLng, processImage, setIsLocationReady, sourceType, messages.locationUnavailable, t]);
};
