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
  // Some devices/providers do not return bounds consistently.
  // In that case we skip ROI gating instead of blocking auto-scan.
  if (!origin || !size) return true;

  const rawCenterX = origin.x + size.width / 2;
  const rawCenterY = origin.y + size.height / 2;
  const maybeNormalized =
    rawCenterX >= 0 &&
    rawCenterX <= 1 &&
    rawCenterY >= 0 &&
    rawCenterY <= 1 &&
    size.width > 0 &&
    size.width <= 1 &&
    size.height > 0 &&
    size.height <= 1;

  const candidates = maybeNormalized
    ? [
        { x: rawCenterX * width, y: rawCenterY * height },
        { x: rawCenterY * width, y: rawCenterX * height },
      ]
    : [
        { x: rawCenterX, y: rawCenterY },
        { x: rawCenterY, y: rawCenterX },
      ];

  const isInsideRoi = candidates.some(
    ({ x, y }) =>
      x >= horizontalMargin &&
      x <= horizontalMargin + viewfinderSize &&
      y >= verticalMargin &&
      y <= verticalMargin + viewfinderSize
  );

  if (isInsideRoi) return true;

  const isMismatchedCoordinateSpace = !maybeNormalized && (rawCenterX > width * 1.5 || rawCenterY > height * 1.5);
  if (isMismatchedCoordinateSpace) {
    return true;
  }

  return false;
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
