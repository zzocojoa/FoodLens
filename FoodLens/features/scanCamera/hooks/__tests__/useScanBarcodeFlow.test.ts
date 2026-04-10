import { act, renderHook } from '@testing-library/react-native';
import type { BarcodeScanningResult } from 'expo-camera';
import { useScanBarcodeFlow } from '../useScanBarcodeFlow';
import { dataStore } from '@/services/dataStore';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';
import { lookupBarcodeWithCache, normalizeBarcodeIngredients } from '../../services/scanCameraBarcodeService';
import { evaluateScanConfidence, isBarcodeInCenteredRoi } from '../../utils/barcodeScannerUtils';
import { resolveRequestIsoCountryCode } from '@/services/aiCore/internal/requestLocale';

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    get: jest.fn(async (_key: string, fallback: unknown) => fallback),
    set: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
    clearAll: jest.fn(async () => undefined),
  },
}));

jest.mock('@/services/ui/uiAlerts', () => ({
  showTranslatedAlert: jest.fn(),
}));

jest.mock('../../services/scanCameraBarcodeService', () => ({
  lookupBarcodeWithCache: jest.fn(),
  normalizeBarcodeIngredients: jest.fn((value: unknown) => value),
}));

jest.mock('../../utils/barcodeScannerUtils', () => ({
  isBarcodeInCenteredRoi: jest.fn(() => true),
  evaluateScanConfidence: jest.fn((params: { currentData: string }) => ({
    action: 'accept',
    nextLastData: params.currentData,
    nextCount: 0,
  })),
}));

jest.mock('@/services/aiCore/internal/requestLocale', () => ({
  resolveRequestIsoCountryCode: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: {
    Success: 'success',
    Error: 'error',
  },
}));

const mockedShowTranslatedAlert = showTranslatedAlert as jest.MockedFunction<typeof showTranslatedAlert>;
const mockedLookupBarcodeWithCache =
  lookupBarcodeWithCache as jest.MockedFunction<typeof lookupBarcodeWithCache>;
const mockedNormalizeBarcodeIngredients =
  normalizeBarcodeIngredients as jest.MockedFunction<typeof normalizeBarcodeIngredients>;
const mockedEvaluateScanConfidence =
  evaluateScanConfidence as jest.MockedFunction<typeof evaluateScanConfidence>;
const mockedIsBarcodeInCenteredRoi =
  isBarcodeInCenteredRoi as jest.MockedFunction<typeof isBarcodeInCenteredRoi>;
const mockedResolveRequestIsoCountryCode =
  resolveRequestIsoCountryCode as jest.MockedFunction<typeof resolveRequestIsoCountryCode>;

const translate = (key: string, fallback?: string): string => fallback || key;

const createBarcodeScan = (data: string): BarcodeScanningResult =>
  ({
    type: 'ean13',
    data,
    bounds: {
      origin: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
    },
    cornerPoints: [],
  }) as BarcodeScanningResult;

describe('useScanBarcodeFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsBarcodeInCenteredRoi.mockReturnValue(true);
    mockedEvaluateScanConfidence.mockImplementation((params: { currentData: string }) => ({
      action: 'accept',
      nextLastData: params.currentData,
      nextCount: 0,
    }));
    mockedResolveRequestIsoCountryCode.mockResolvedValue('KR');
  });

  it('preserves barcode_lookup origin on successful barcode scans', async () => {
    const replace = jest.fn();
    const setPendingAnalysisOrigin = jest.fn();
    const setDataSpy = jest.spyOn(dataStore, 'setData').mockImplementation(() => undefined);

    mockedLookupBarcodeWithCache.mockResolvedValue({
      found: true,
      data: {
        foodName: 'Protein Bar',
        safetyStatus: 'SAFE',
        ingredients: [],
      },
    } as Awaited<ReturnType<typeof lookupBarcodeWithCache>>);
    mockedNormalizeBarcodeIngredients.mockImplementation((value) => value);

    const { result } = renderHook(() =>
      useScanBarcodeFlow({
        mode: 'BARCODE',
        scanned: false,
        isAnalyzing: false,
        isConnectedRef: { current: true },
        isProcessingRef: { current: false },
        cachedLocation: { current: null },
        resetState: jest.fn(),
        replace,
        setScanned: jest.fn(),
        setIsAnalyzing: jest.fn(),
        setActiveStep: jest.fn(),
        setMode: jest.fn(),
        setPendingAnalysisOrigin,
        ensureAnalysisAccess: jest.fn().mockResolvedValue(true),
        t: translate,
      })
    );

    await act(async () => {
      result.current.handleBarcodeScanned(createBarcodeScan('8801234567890'));
      await Promise.resolve();
    });

    expect(setPendingAnalysisOrigin).toHaveBeenCalledWith(null);
    expect(setDataSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisOrigin: 'barcode_lookup',
      }),
      expect.anything(),
      expect.any(String),
      expect.any(String)
    );
    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/result',
        params: expect.objectContaining({
          analysisOrigin: 'barcode_lookup',
          isBarcode: 'true',
        }),
      })
    );

    setDataSpy.mockRestore();
  });

  it('preserves barcode_to_label_fallback origin when barcode lookup fails', async () => {
    const setMode = jest.fn();
    const setPendingAnalysisOrigin = jest.fn();

    mockedLookupBarcodeWithCache.mockResolvedValue({
      found: false,
    } as Awaited<ReturnType<typeof lookupBarcodeWithCache>>);

    const { result } = renderHook(() =>
      useScanBarcodeFlow({
        mode: 'BARCODE',
        scanned: false,
        isAnalyzing: false,
        isConnectedRef: { current: true },
        isProcessingRef: { current: false },
        cachedLocation: { current: null },
        resetState: jest.fn(),
        replace: jest.fn(),
        setScanned: jest.fn(),
        setIsAnalyzing: jest.fn(),
        setActiveStep: jest.fn(),
        setMode,
        setPendingAnalysisOrigin,
        ensureAnalysisAccess: jest.fn().mockResolvedValue(true),
        t: translate,
      })
    );

    await act(async () => {
      result.current.handleBarcodeScanned(createBarcodeScan('8801234567890'));
      await Promise.resolve();
    });

    const alertConfig = mockedShowTranslatedAlert.mock.calls.at(-1)?.[1];
    expect(alertConfig?.buttons).toHaveLength(2);

    await act(async () => {
      alertConfig?.buttons?.[1]?.onPress?.();
    });

    expect(setPendingAnalysisOrigin).toHaveBeenCalledWith('barcode_to_label_fallback');
    expect(setMode).toHaveBeenCalledWith('LABEL');
  });
});
