import { lookupBarcodeWithCache } from '../scanCameraBarcodeService';
import { lookupBarcode } from '../../../../services/ai';
import { getAllergyString } from '../../../../services/aiCore/allergy';
import { BarcodeCache } from '../../../../services/aiCore/internal/barcodeCache';
import type { BarcodeLookupResult } from '../../../../services/aiCore/types';

jest.mock('../../../../services/ai', () => ({
  lookupBarcode: jest.fn(),
}));

jest.mock('../../../../services/aiCore/allergy', () => ({
  getAllergyString: jest.fn(),
}));

jest.mock('../../../../services/aiCore/internal/barcodeCache', () => ({
  BarcodeCache: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

const mockedLookupBarcode = lookupBarcode as jest.MockedFunction<typeof lookupBarcode>;
const mockedGetAllergyString = getAllergyString as jest.MockedFunction<typeof getAllergyString>;
const mockedBarcodeCache = BarcodeCache as jest.Mocked<typeof BarcodeCache>;

describe('scanCameraBarcodeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetAllergyString.mockResolvedValue('Soy');
  });

  it('does not log raw barcode when legacy barcode cache hits', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const cachedResult: BarcodeLookupResult = {
      found: true,
    };
    mockedBarcodeCache.get.mockResolvedValueOnce(cachedResult);

    const result = await lookupBarcodeWithCache('8801043015981');

    expect(result).toBe(cachedResult);
    expect(mockedLookupBarcode).not.toHaveBeenCalled();
    const serializedLogs = JSON.stringify(consoleLogSpy.mock.calls);
    expect(serializedLogs).not.toContain('8801043015981');
    expect(serializedLogs).toContain('***5981');

    consoleLogSpy.mockRestore();
  });

  it('masks short barcode values in legacy barcode cache logs', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockedBarcodeCache.get.mockResolvedValueOnce({
      found: true,
    });

    await lookupBarcodeWithCache('123');

    const serializedLogs = JSON.stringify(consoleLogSpy.mock.calls);
    expect(serializedLogs).not.toContain('123');
    expect(serializedLogs).toContain('***');

    consoleLogSpy.mockRestore();
  });
});
