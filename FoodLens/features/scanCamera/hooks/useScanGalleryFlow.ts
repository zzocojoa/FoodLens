import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { resolveGalleryMetadata } from '../utils/galleryMetadata';
import { LocationData } from '@/services/utils/types';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';

type Translate = (key: string, fallback?: string) => string;

type UseScanGalleryFlowParams = {
  mode: 'LABEL' | 'FOOD' | 'BARCODE';
  processImage: (
    uri: string,
    source: 'camera' | 'library',
    timestamp?: string | null,
    customLocation?: LocationData | null
  ) => Promise<void>;
  processLabel: (uri: string, timestamp?: string | null) => Promise<void>;
  processSmart: (
    uri: string,
    timestamp?: string | null,
    customLocation?: LocationData | null
  ) => Promise<void>;
  t: Translate;
};

export const useScanGalleryFlow = ({
  mode,
  processImage,
  processLabel,
  processSmart,
  t,
}: UseScanGalleryFlowParams) => {
  return useCallback(async () => {
    Haptics.selectionAsync();

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        quality: 0.8,
        exif: true,
      });

      if (result.canceled || !result.assets[0]?.uri) return;
      const asset = result.assets[0];
      const { timestamp: finalDate, exifLocation } = await resolveGalleryMetadata(asset);
      if (mode === 'LABEL') {
        console.log('[ScanGallery] route:LABEL -> analyzeLabel');
        await processLabel(asset.uri, finalDate);
        return;
      }
      if (mode === 'FOOD') {
        console.log('[ScanGallery] route:FOOD -> analyzeImage');
        await processImage(asset.uri, 'library', finalDate, exifLocation);
        return;
      }
      // BARCODE mode keeps smart routing for gallery images.
      console.log('[ScanGallery] route:BARCODE -> analyzeSmart');
      await processSmart(asset.uri, finalDate, exifLocation);
    } catch {
      showTranslatedAlert(t, {
        titleKey: 'camera.alert.errorTitle',
        titleFallback: 'Error',
        messageKey: 'scan.alert.galleryOpenFailed',
        messageFallback: 'Unable to open gallery.',
      });
    }
  }, [mode, processImage, processLabel, processSmart, t]);
};
