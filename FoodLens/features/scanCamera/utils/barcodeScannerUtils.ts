import { BarcodeScanningResult } from 'expo-camera';
import { Dimensions } from 'react-native';

type ScanConfidenceParams = {
  currentData: string;
  lastData: string | null;
  consecutiveScans: number;
  requiredMatches?: number;
};

type ScanConfidenceResult =
  | { action: 'wait'; nextCount: number; nextLastData: string }
  | { action: 'accept'; nextCount: 0; nextLastData: string }
  | { action: 'reset'; nextCount: 1; nextLastData: string };

export const isBarcodeInCenteredRoi = (
  scanningResult: BarcodeScanningResult,
  viewfinderSize: number = 280
): boolean => {
  const { width, height } = Dimensions.get('window');
  const horizontalMargin = (width - viewfinderSize) / 2;
  const verticalMargin = (height - viewfinderSize) / 2;

  const origin = scanningResult.bounds?.origin;
  const size = scanningResult.bounds?.size;
  if (!origin || !size) return false;

  const barcodeCenterX = origin.x + size.width / 2;
  const barcodeCenterY = origin.y + size.height / 2;

  return (
    barcodeCenterX >= horizontalMargin &&
    barcodeCenterX <= horizontalMargin + viewfinderSize &&
    barcodeCenterY >= verticalMargin &&
    barcodeCenterY <= verticalMargin + viewfinderSize
  );
};

export const evaluateScanConfidence = ({
  currentData,
  lastData,
  consecutiveScans,
  requiredMatches = 3,
}: ScanConfidenceParams): ScanConfidenceResult => {
  if (currentData === lastData) {
    const nextCount = consecutiveScans + 1;
    if (nextCount >= requiredMatches) {
      return { action: 'accept', nextCount: 0, nextLastData: currentData };
    }
    return { action: 'wait', nextCount, nextLastData: currentData };
  }

  return { action: 'reset', nextCount: 1, nextLastData: currentData };
};
