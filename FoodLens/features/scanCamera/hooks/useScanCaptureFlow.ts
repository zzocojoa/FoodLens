import { useCallback } from 'react';
import { MutableRefObject } from 'react';
import { CameraView } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';

type Translate = (key: string, fallback?: string) => string;

type UseScanCaptureFlowParams = {
  cameraRef: MutableRefObject<CameraView | null>;
  mode: 'LABEL' | 'FOOD' | 'BARCODE';
  processImage: (uri: string, source: 'camera' | 'library', timestamp?: string | null) => Promise<void>;
  processLabel: (uri: string, timestamp?: string | null) => Promise<void>;
  t: Translate;
};

export const useScanCaptureFlow = ({
  cameraRef,
  mode,
  processImage,
  processLabel,
  t,
}: UseScanCaptureFlowParams) => {
  return useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: false,
        exif: true,
      });

      if (!photo?.uri) return;
      const orientation =
        typeof photo.width === 'number' && typeof photo.height === 'number'
          ? photo.width >= photo.height
            ? 'landscape'
            : 'portrait'
          : 'unknown';
      console.log('[ScanCapture] photo-orientation', {
        orientation,
        width: photo.width,
        height: photo.height,
      });
      const exifDate = photo.exif?.DateTimeOriginal || photo.exif?.DateTime || null;

      if (mode === 'BARCODE') {
        console.log('[ScanCapture] route:BARCODE');
        showTranslatedAlert(t, {
          titleKey: 'scan.alert.noticeTitle',
          titleFallback: 'Notice',
          messageKey: 'scan.alert.aimBarcode',
          messageFallback: 'Please point the barcode at the camera.',
        });
        return;
      }

      if (mode === 'LABEL') {
        console.log('[ScanCapture] route:LABEL -> analyzeLabel');
        await processLabel(photo.uri, exifDate);
        return;
      }

      console.log('[ScanCapture] route:FOOD -> analyzeImage');
      await processImage(photo.uri, 'camera', exifDate);
    } catch {
      showTranslatedAlert(t, {
        titleKey: 'camera.alert.errorTitle',
        titleFallback: 'Error',
        messageKey: 'scan.alert.captureFailed',
        messageFallback: 'Failed to capture photo.',
      });
    }
  }, [cameraRef, mode, processImage, processLabel, t]);
};
