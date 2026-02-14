import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import { AnalysisService } from '@/services/analysisService';
import { HapticsService } from '@/services/haptics';
import { showOpenSettingsAlert } from '@/services/ui/permissionDialogs';
import { photoLibraryService } from '../services/photoLibraryService';
import { TEST_UID } from '../constants/result.constants';

export const useDateUpdateAction = (
    savedRecordId: string | null,
    updateTimestamp: (date: Date) => void,
    closeEditor: () => void
) => {
    return React.useCallback(
        async (newDate: Date) => {
            updateTimestamp(newDate);

            if (savedRecordId) {
                await AnalysisService.updateAnalysisTimestamp(TEST_UID, savedRecordId, newDate);
                HapticsService.success();
            }

            closeEditor();
        },
        [savedRecordId, updateTimestamp, closeEditor]
    );
};

export const useNewResultHaptic = (resultExists: boolean) => {
    const params = useLocalSearchParams();

    React.useEffect(() => {
        if (resultExists && params['isNew'] === 'true') {
            const timer = setTimeout(() => {
                HapticsService.success();
            }, 300);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [resultExists, params['isNew']]);
};

export const usePhotoLibraryAutoSave = ({
  isNew,
  imageUri,
  isBarcode,
  locationData,
  t,
}: {
  isNew: string | string[] | undefined;
  imageUri?: string;
  isBarcode?: boolean;
  locationData?: { latitude?: number | string; longitude?: number | string } | null;
  t: (key: string, fallback?: string) => string;
}) => {
  const processedImageRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (isNew !== 'true') return;
    if (!imageUri) return;
    if (isBarcode) return;

    const key = imageUri;
    if (processedImageRef.current === key) return;
    processedImageRef.current = key;

    let cancelled = false;

    const run = async () => {
      const saved = await photoLibraryService.saveImageToLibrary(imageUri, locationData);
      console.log('[PhotoLibraryGPS] save attempt result', {
        status: saved.status,
        imageUri,
        locationData,
      });
      if (cancelled) return;

      if (saved.status === 'denied') {
        showOpenSettingsAlert({
          title: t('result.photoSave.permissionDeniedTitle', 'Photo Access Denied'),
          message: t(
            'result.photoSave.permissionDeniedMessage',
            'Enable photo access in Settings to save scan images to your device gallery.'
          ),
          cancelLabel: t('common.cancel', 'Cancel'),
          settingsLabel: t('scan.permission.openSettings', 'Open Settings'),
        });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [imageUri, isBarcode, isNew, locationData, t]);
};
